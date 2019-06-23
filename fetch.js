const request = require('request');
const yaml = require('js-yaml');
const fs = require('fs');
require('dotenv').config();

let checkedRepositories = {};
const makeRequest = (issueURL) => {
  const headers = {
    Authorization:
      'Basic ' +
      Buffer.from(
        'andersfischernielsen' + ':' + process.env.PASS,
        'utf8',
      ).toString('base64'),
    'User-Agent': 'andersfischernielsen',
  };

  request(
    issueURL,
    {
      json: true,
      headers: headers,
    },
    (err, res, issues) => {
      if (err) console.error(err);
      if (issues && res.statusCode === 403)
        console.error('Rate limit exceeded!');
      if (issues && res.statusCode === 200 && issues.length > 0) {
        try {
          const name = issues[0].repository_url
            .replace('https://api.github.com/repos/', '')
            .replace(/.*\//, '');
          const stats = {
            name: name,
            issues: issues.length,
            labelled: issues.filter((i) => i.labels && i.labels.length > 0)
              .length,
          };
          if (!checkedRepositories[stats.name])
            checkedRepositories[stats.name] = stats;
          else {
            checkedRepositories[stats.name].issues += stats.issues;
            checkedRepositories[stats.name].labelled += stats.labelled;
          }
          checkedRepositories[stats.name].percent =
            (checkedRepositories[stats.name].labelled /
              checkedRepositories[stats.name].issues) *
            100;

          const sorted = Object.fromEntries(
            Object.entries(checkedRepositories).filter(
              ([_, v]) => v.issues >= 100 && v.percent >= 65,
            ),
          );
          fs.writeFileSync(
            `fetched_issues/checked.yaml`,
            yaml.safeDump(checkedRepositories),
          );
          fs.writeFileSync(
            `fetched_issues/statistics.yaml`,
            yaml.safeDump(sorted),
          );

          if (issues.length == 100) {
            const pagestart = issueURL.indexOf('page=');
            const page = +issueURL.slice(pagestart + 5, issueURL.length)[0] + 1;
            const url =
              issueURL.slice(0, pagestart + 5) + page + 'per_page=100';
            makeRequest(url);
          }
        } catch (err) {
          console.error(err);
        }
      }
    },
  );
};

fs.readFile('fetched_issues/checked.yaml', (err, content) => {
  const loaded = yaml.safeLoad(content);
  checkedRepositories = loaded && loaded != 'undefined' ? loaded : {};

  request(
    'https://raw.githubusercontent.com/ros/rosdistro/master/melodic/distribution.yaml',
    (err, res, body) => {
      const loaded = yaml.safeLoad(body);
      let repositories = loaded.repositories;

      for (let i = 0; i < checkedRepositories.length; i++) {
        const checked = checkedRepositories[i];
        delete repositories[checked];
      }

      let timeout = 1000;
      for (const name in repositories) {
        const repo = repositories[name];
        if (!repo.source) continue;
        let url = repo.source.url;
        if (url.match('bitbucket')) continue;
        const split = url.split(/\.|github.com/);
        split.splice(1, 0, 'api.github.com/repos');
        split[3] = '/issues?state=all&page=1&per_page=100';
        const issueURL = split.join('');
        setTimeout(() => makeRequest(issueURL), timeout);
        timeout += 1000;
      }
    },
  );
});
