const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const argv = require('minimist')(process.argv.slice(2));
const { graphql } = require("@octokit/graphql");
const chalk = require('chalk');

const { token, suffix = 'md' } = argv;

const graphqlClient = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

function postFootnotes(content) {
  const footnotes = [];

  content = content.replace(/<a (.+?)>(.+?)<\/a>/ig, (_, a, b) => {
    const _a = a.match(/href=\"(.+?)\"/);
    footnotes.push([_a[1], b]);
    return `<a ${a}>${b}<sup>[${footnotes.length + 1}]</sup></a>`
  });

  const footContent = footnotes.map((i) => `<li style="font-size: 14px"><b style="color: #666">${i[1]}</b>: <span style="color: #888">${i[0]}</span></li>`).join('\n');
  content += `<hr>\n<h3>${argv['footnote-title'] || '参考资料'}</h3><ol>${footContent}</ol>`;

  return content;
}

function postQRCode({ content, root, number }) {
  let count = 1;
  mkdir(`${root}/imgs`);

  content = content.replace(/<li><a (.+?)>(.+?)<\/a>(.+?)?<\/li>/ig, (_, a, b, c) => {
    const _a = a.match(/href=\"(.+?)\"/);
    const issues = `issues-${number.toString().padStart(4, '0')}`;
    const imgName = `${issues}_${count}.png`;
    const imgPath = path.resolve(`${root}/imgs`, imgName);

    generateQR(imgPath, _a[1]);
    count += 1;

    const imgURL = argv['img-path'] ? path.join(argv['img-path'], issues) : '.';

    const qrCard = `<div style="margin: 12px 0 20px;padding: 16px 20px;max-width: 100%;box-sizing: border-box;white-space: normal;text-size-adjust: auto;color: rgb(63, 63, 63);font-family: Optima-Regular, Optima, PingFangSC-light, PingFangTC-light, 'PingFang SC', Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;letter-spacing: 0.476px;text-align: left;display: flex;align-items: center;background-color: rgb(246, 246, 246);box-shadow: rgb(199, 201, 204) 0px 0px 0px inset;border-radius: 6px;border-color: rgb(62, 62, 62);font-size: 12px;overflow: hidden;overflow-wrap: break-word !important;">
      <div style="padding-right: 12px;max-width: 100%;box-sizing: border-box;flex: 1 1 0%;display: flex;flex-direction: column;justify-content: space-between;overflow-wrap: break-word !important;">
        <strong style="max-width: 100%;box-sizing: border-box;color: rgb(114, 114, 114);line-height: 1.75em;overflow-wrap: break-word !important;">${argv['qrcode-tip'] || '长按识别二维码查看原文'}</strong>
        <p stype="max-width: 100%;box-sizing: border-box;min-height: 1em;line-height: 1.8;color: rgb(114, 114, 114);word-break: break-all;overflow-wrap: break-word !important;">${_a[1]}</p>
      </div>
      <div style="max-width: 90px;box-sizing: border-box;flex-shrink: 0;font-size: 0px;overflow-wrap: break-word !important;">
        <img style="margin-right: auto; margin-left: auto; box-sizing: border-box; vertical-align: middle; border-style: none; display: block; border-radius: 4px; overflow-wrap: break-word !important; visibility: visible !important; width: 90px !important; height: auto !important;" src="${imgURL}/imgs/${imgName}" />
      </div>
    </div>`;

    return `<li><a ${a}>${b}</a>${c || ''}\n\n${qrCard}</li>`
  });

  return content;
}

async function getPosts({ owner, repo, otherLabels = '', root }) {
  let last = null;
  let totalCount = 0;
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
      const { labels, number, bodyHTML, title } = post;
      const _labels = labels.edges;

      _labels.forEach(({ node: label }) => {
        if (['wechat-link', 'wechat-post', ...(otherLabels.split(','))].includes(label.name)) {
          const _root = path.resolve(root, `issues-${number.toString().padStart(4, '0')}`);

          mkdir(_root);

          let content;
          let type;

          if (label.name === 'wechat-link') {
            content = postQRCode({ content: bodyHTML, root: _root, number });
            type = 'QRCode';
          } else {
            content = postFootnotes(bodyHTML);
            type = 'Post';
          }

          writePost({ root: _root, content, title, type });
        }
      })
    });

    if (i === Math.ceil(totalCount / 100) - 1) {
      console.log(`\n✨ Done!`);
    }

    last = Array.from(result).pop().cursor;
  }
}

function mkdir(root) {
  try {
    const isExist = fs.existsSync(root);
    if (!isExist) fs.mkdirSync(root, { recursive: true });
  } catch (e) {
    console.error(e);
    process.exit();
  }
}

function writePost({ root, title, content, type }) {
  const _root = path.resolve(root, `index.${suffix}`);
  try {
    fs.writeFileSync(_root, content);
    console.log(chalk.green(`[📝 ${type}] ${title}`), '~>', chalk.grey(_root));
  } catch (e) {
    console.error(e);
    process.exit();
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
              bodyHTML
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

async function generateQR(filename, link) {
  try {
    const data = await qrcode.toDataURL(link);
    const base64Data = data.replace(/^data:image\/png;base64,/, '');
    const binaryData = new Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filename, binaryData, { encoding: 'base64' });
  } catch (err) {
    console.error(err);
  }
};

module.exports = {
  getPosts,
};
