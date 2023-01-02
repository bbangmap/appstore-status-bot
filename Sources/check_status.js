const slack = require("./slack.js");
const exec = require("child_process").exec;
const dirty = require("dirty");
const { Octokit, App } = require("octokit");
const request = require("request-promise-native");
const { prependOnceListener } = require("process");
const fs = require("fs").promises;
const env = Object.create(process.env);
const octokit = new Octokit({ auth: `token ${process.env.GH_TOKEN}` });

const main = async () => {
  var existGist = await getGist();

  var checked_app_list = [];

  exec(
    "ruby Sources/fetch_app_status.rb",
    { env: env },
    function (_, app, stderr) {
      if (app) {
        var parsed_app = JSON.parse(app);
        var parsed_gist = JSON.parse(existGist);

        for (let index = 0; index < parsed_app.length; index++) {
          var checked_app = checkVersion(parsed_app[index], parsed_gist[index]);
          checked_app_list += checked_app;
        }
      } else {
        console.log("There was a problem fetching the status of the app!");
        console.log(stderr);
      }
    }
  );

  await updateGist(checked_app_list);
};

const checkVersion = async (app, gist) => {
  console.log("[*] checkVersion", gist, "gist");
  if (gist && gist.submission_start_date) {
    app["submission_start_date"] = gist.submission_start_date;
    var isEqualPhasesState = app.app_store_version_phased_release.phased_release_state == gist.app_store_version_phased_release.phased_release_state
    var isEqualPhasesDay = app.app_store_version_phased_release.current_day_number == gist.app_store_version_phased_release.current_day_number
  }

  var currentDay = app.app_store_version_phased_release.current_day_number
  var phased_release_state = app.app_store_version_phased_release.phased_release_state
  app["phase_percentage"] = calculatePercentage(currentDay, phased_release_state)

  if (!app.appID || !isEqualPhasesState || app.status != gist.status || (!isEqualPhasesDay && phased_release_state == "ACTIVE")) {
    console.log("[*] status is different");

    var submission_start_date = gist.submission_start_date
    if (!submission_start_date) {
      submission_start_date = new Date();
    }
    slack.post(app, submission_start_date);

    if (app.status == "Waiting for review") {
      app["submission_start_date"] = new Date();
    }
  } else {
    console.log("[*] status is same");
  }

  return app;
};
const calculatePercentage = (currentDay, phased_release_state, status) => {
  if (status != "Ready for sale") {
    return "Before Deployment"
  }
  if (phased_release_state == "COMPLETE") {
    return "Gradual deployment completed"
  }
  if (phased_release_state == "PAUSED") {
     return "Progressive deployment disruption"
  }
  if (phased_release_state != "ACTIVE") {
    return "Progressive deployment not in progress"
  }
  if (currentDay == 1) {
    return "1%"
  }
  if (currentDay == 2) {
    return "2%"
  }
  if (currentDay == 3) {
    return "5%"
  }
  if (currentDay == 4) {
    return "10%"
  }
  if (currentDay == 5) {
    return "20%"
  }
  if (currentDay == 6) {
    return "50%"
  }
  if (currentDay == 7) {
    return "100%"
  }
  return "Progressive deployment not in progress"
};

const getGist = async () => {
  const gist = await octokit.rest.gists
    .get({
      gist_id: process.env.GIST_ID,
    })
    .catch((error) => console.error(`[*] Unable to update gist\n${error}`));
  if (!gist) return;

  const filename = Object.keys(gist.data.files)[0];
  const rawdataURL = gist.data.files[filename].raw_url;

  const options = {
    url: rawdataURL,
  };

  return await request.get(options)
};

const updateGist = async (content) => {
  console.log("[*] updateGist");

  const gist = await octokit.rest.gists
    .get({
      gist_id: process.env.GIST_ID,
    })
    .catch((error) => console.error(`[*] Unable to update gist\n${error}`));
  if (!gist) return;

  const filename = Object.keys(gist.data.files)[0];
  await octokit.rest.gists.update({
    gist_id: process.env.GIST_ID,
    files: {
      [filename]: {
        content: JSON.stringify(content),
      },
    },
  });
};

main();
