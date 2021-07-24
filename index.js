#!/usr/bin/env node

const fs = require('fs');
const chalk = require('chalk');
const qrcode = require('qrcode');
// const slugify = require('slugify');
const argv = require('minimist')(process.argv.slice(2));
const { graphql } = require("@octokit/graphql");

const { owner, repo, token, labels: otherLabels } = argv;

const graphqlClient = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

async function init() {
  if (argv.h || argv.help) {
    cmdHelp();
    process.exit();
  }

  if (!owner || !repo || !token) {
    console.log('\n', chalk.red('required: `owner`, `repo`, `token`'));
    process.exit();
  }

  getPosts({ owner, repo, otherLabels });
}

init()
  .catch((err) => {
    console.error(err);
  });

async function getPosts({ owner, repo, otherLabels = [] }) {
  let last = null;
  const _data = await graphqlClient(`
    query ($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        discussions {
          totalCount
        }
      }
    }
  `, {
    owner,
    repo,
  });

  totalCount = _data.repository.discussions.totalCount;
  for (let i = 0; i < Math.ceil(totalCount / 100); i++) {
    const result = await getIssues({ owner, repo, lastCursor: last });

    result.forEach(({ node: post }) => {
      const { labels, number } = post;
      const _labels = labels.edges;
      _labels.forEach(({ node: label }) => {
        if (['wechat-link', 'wechat-post', ...otherLabels].includes(label.name)) {
          // TODO:
          console.log(number);
        }
      })
    });

    last = Array.from(result).pop().cursor;
  }
}

async function getIssues({ owner, repo, lastCursor }) {
  const { repository } = await graphqlClient(`
    query ($owner: String!, $repo: String!, $cursor: String) {
      repository(owner: $owner, name: $repo) {
        discussions(first: 100, after: $cursor) {
          edges {
            cursor
            node {
              title
              number
              body
              labels(first: 10) {
                edges {
                  node {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `, {
    owner,
    repo,
    cursor: lastCursor,
  });
  return repository.discussions.edges;
}

function mdToLinkGroup(file) {
  const content = fs.readFileSync(file).toString();
  const data = content.match(/\[.*\]\(http.*\)/ig);
  return data.map(i => {
    const [_, a, b] = i.match(/\[(.*)\]\((http.*)\)/);
    return [a, b];
  })
}

async function generateQR(str) {
  try {
    return await qrcode.toDataURL(str);
  } catch (err) {
    console.error(err);
  }
};

function cmdHelp() {
  return console.log(`
usage: woap
options:
  --owner
  --repo
  --token: generate token -> https://github.com/settings/tokens/new
  --labels: this \`label\` needs to generate WeChat articles, if there are multiple, use commas to separate
  `);
}
