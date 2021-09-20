const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode');
const argv = require('minimist')(process.argv.slice(2));
const { graphql } = require("@octokit/graphql");
const chalk = require('chalk');
const juice = require('juice');
const { v4: uuidv4 } = require('uuid');

const mdcss = require('./mdcss');

const { token, ext = 'html', ignore } = argv;

const graphqlClient = graphql.defaults({
  headers: {
    authorization: `token ${token}`,
  },
});

function postFootnotes(content) {
  const footnotes = [];

  content = content.replace(/<a (.+?)>(.+?)<\/a>/ig, (_, a, b) => {
    const _a = a.match(/href=\"(.+?)\"/);

    if (ignore) {
      const pathname = (new URL(_a[1]) || {}).pathname;
      if (pathname && !new RegExp(ignore).test(pathname)) {
        footnotes.push([_a[1], b]);
        return `<span style="color: #1e6bb8;" ${a}>${b}<sup style="line-height: 0;color: #1e6bb8;">[${footnotes.length}]</sup></span>`
      }
      return _;
    }

    footnotes.push([_a[1], b]);
    return `<span style="color: #1e6bb8;" ${a}>${b}<sup style="line-height: 0;color: #1e6bb8;">[${footnotes.length}]</sup></span>`
  });

  content = content.replace(/<li>(.+?)<\/li>/ig, `<li><span>$1</span></li>`);

  const footContent = footnotes.map((i, idx) => `<span class="item" style="font-size: 14px"><span style="color: #555">[${idx+1}]</span><p><span style="margin-right: 5px;">${i[1]}:</span> <em style="color: #999">${i[0]}</em></p></span>`).join('\n');
  content += `<hr>\n<h4>${argv['footnote-title'] || '参考资料'}</h4><section class="woap-links">${footContent}</section>`;

  return content;
}

async function postQRCode(content) {
  const imgMap = new Map();

  content = content.replace(/<li><a (.+?)>(.+?)<\/a>(.+?)?<\/li>/ig, (_, a, b, c) => {
    const _a = a.match(/href=\"(.+?)\"/);
    const id = uuidv4();
    imgMap.set(id, _a[1]);
    const qrCard = `<section class="woap-qrcode">
      <section class="text">
        <strong>${argv['qrcode-tip'] || '长按识别二维码查看原文'}</strong>
        <p>${_a[1]}</p>
      </section>
      <section class="qrcode">
        <img src="{{${id}}}" />
      </section>
    </section>`;
    return `<li><a ${a}>${b}</a>${c || ''}\n\n${qrCard}</li>`
  });

  for (let [imgKey, imgVal] of imgMap.entries()) {
    const base64Data = await generateQR(imgVal);
    content = content.replace(new RegExp(`{{${imgKey}}}`), base64Data);
  }

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

      _labels.forEach(async ({ node: label }) => {
        if (['wechat-link', 'wechat-post', ...(otherLabels.split(','))].includes(label.name)) {
          const _root = path.resolve(root, `issues-${number.toString().padStart(4, '0')}`);

          mkdir(_root);

          let content;
          let type;

          if (label.name === 'wechat-link') {
            content = await postQRCode(bodyHTML);
            type = 'QRCode';
          } else {
            content = postFootnotes(bodyHTML);
            type = 'Post';
          }

          // copyElementToClipboard: https://stackoverflow.com/questions/34191780/javascript-copy-string-to-clipboard-as-text-html
          const html = renderHTML(title, content);
          writePost({ root: _root, content: html, title, type });
        }
      })
    });

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
  const _root = path.resolve(root, `index.${ext}`);
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

async function generateQR(link) {
  try {
    return await qrcode.toDataURL(link);
  } catch (err) {
    console.error(err);
    return null;
  }
};

function renderHTML(title, content) {
  return juice(`<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no" />
<style>${mdcss}</style>
<script>
function copyElementToClipboard(element) {
  window.getSelection().removeAllRanges();
  let range = document.createRange();
  range.selectNode(typeof element === 'string' ? document.getElementById(element) : element);
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
}
window.addEventListener('load', function() {
  const woapBtn = document.getElementById('woap-btn');
  const woapHTML = document.getElementById('woap-body');
  woapBtn.addEventListener('click', function() {
    copyElementToClipboard(woapHTML);
    alert('复制到公众号')
  }, false);
})
</script>
</head>
<body>
<h2 class="woap-title">${title}</h2>
<div class="markdown-body" id="woap-body">
<div>${content}</div>
</div>
<div id="woap-btn" style="position: fixed;top: 10px;right: 10px;width: 43px;height: 41px;box-sizing: border-box;cursor: pointer;background: #fff;border-radius: 50%;padding: 8px;box-shadow: 0 0 2px #d8d8d8;">
<svg style="width: 100%;height: 100%" height="41" viewBox="0 0 43 41" width="43" xmlns="http://www.w3.org/2000/svg"><g fill="#07c160"><path d="m39.7 15.3c-3.7-4.9-10.2-6.2-16.1-4.1.2.1.4.1.6.2 8.7 2.9 13.3 12.3 10.4 21-.8 2.3-2 4.3-3.5 6 1.9-.5 3.8-1.3 5.4-2.5 6.6-5.1 7.9-14.5 3.2-20.6z"/><path d="m18 10.4c.4-.3.7-.5 1.1-.8h.1c.4-.2.8-.4 1.1-.7 0 0 .1 0 .1-.1.8-.4 1.6-.7 2.4-1 .1 0 .1 0 .2-.1.4-.1.8-.3 1.2-.4h.1c.4-.1.8-.2 1.2-.2h.2c.6-.1 1-.1 1.4-.1h.3c.4 0 .9-.1 1.3-.1.5 0 1 0 1.5.1h.2c.5 0 .9.1 1.4.2h.2c.5.1.9.2 1.3.3.1 0 .1 0 .2.1.5.1 1 .2 1.4.4-.2-.4-.4-.7-.4-.7-2.9-4.6-7.7-7.3-12.9-7.3-3.1 0-7.9 1.1-11.5 5.4-2.4 2.9-3.2 6.3-2.7 9.7.3 2.3 1.6 5.4 3.5 7.3.7-4.9 3.3-9.2 7.1-12z"/><path d="m21.6 30.9c-1.3 0-2.6-.2-3.8-.4-.1 0-.3 0-.5 0-.4 0-.7.1-1 .3l-4 2.6c-.1.1-.2.1-.4.1-.3 0-.6-.3-.7-.6 0-.2 0-.3.1-.5 0-.1.4-2 .7-3.2 0-.1.1-.3 0-.4 0-.4-.2-.8-.6-1-4.3-2.9-7.2-7.5-7.8-12.2-1.1 1.7-1.6 3-2.2 5-2.1 7.3 2.5 16 9.9 18.4 8.6 2.8 16.7-.3 19.5-7.6.3-.9.7-2.4.8-3.6-2.9 2.1-6 3.1-10 3.1z"/></g></svg>
</div>
</body>
</html>
`);
}

module.exports = {
  getPosts,
};
