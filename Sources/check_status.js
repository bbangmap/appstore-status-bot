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

  exec(
    "ruby Sources/fetch_app_status.rb",
    { env: env },
    function (_, app, stderr) {
      if (app) {
        var parsed_app = JSON.parse(app);
        var parsed_gist = JSON.parse(existGist);

        checkVersion(parsed_app, parsed_gist);
      } else {
        console.log("There was a problem fetching the status of the app!");
        console.log(stderr);
      }
    }
  );
};

const checkVersion = async (app, gist) => {
  console.log("[*] checkVersion");
  var app = app[0];
  app["submission_start_date"] = gist.submission_start_date;
  var currentDay = app.app_store_version_phased_release.current_day_number
  var phased_release_state = app.app_store_version_phased_release.phased_release_state
  app["phase_percentage"] = calculatePercentage(currentDay, phased_release_state)

  if (!app.appID || phased_release_state.phased_release_state != gist.app_store_version_phased_release.phased_release_state || app.status != gist.status || phased_release_state.current_day_number != gist.app_store_version_phased_release.current_day_number) {
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

  await updateGist(app);
};
const calculatePercentage = (currentDay, phased_release_state) => {
  if (phased_release_state == "PAUSED") {
    return "점진적 배포가 중단되었습니다."
  }
  if (phased_release_state != "ACTIVE") {
    return "점진적 배포 진행중이 아닙니다."
  }
  if (currentDay == 1) {
    return "1%"
  } else if (currentDay == 2) {
    return "2%" 
  } else if (currentDay == 3) {
    return "5%"
  } else if (currentDay == 4) {
    return "10%"
  } else if (currentDay == 5) {
    return "20%"
  } else if (currentDay == 6) {
    return "50%"
  } else if (currentDay == 7) {
    return "100%"
  } else {
    return "점진적 배포 진행중이 아닙니다."
  }
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
