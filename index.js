#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const argv = require('minimist')(process.argv.slice(2));

const { getPosts } = require('./utils');

const { owner, repo, token, labels: otherLabels, root = 'posts' } = argv;

async function init() {
  if (argv.h || argv.help) {
    cmdHelp();
    process.exit();
  }

  if (!owner || !repo || !token) {
    console.log('\n', chalk.red('required: `owner`, `repo`, `token`'));
    process.exit();
  }

  const _root = path.resolve(process.cwd(), root);
  const isExist = fs.existsSync(_root);
  if (!isExist) fs.mkdirSync(_root, { recursive: true });

  console.log(`\n${chalk.yellow('woap building...')}\n`);
  await getPosts({ owner, repo, otherLabels, root: _root });
}

init()
  .catch((err) => {
    console.error(err);
  });


function cmdHelp() {
  const g = chalk.green;
  const y = chalk.yellow;
  return console.log(`
usage: ${g`woap`}

options:

  ${g`--owner`}:     GitHub 用户名（username）

  ${g`--repo`}:      需要生成微信文章的 GitHub 仓库名（请确保已经开启 Discussions）
               ${y`Repository -> Settings -> Options -> Features -> Discussions`}

  ${g`--token`}:     GitHub API 请求需要用到，获取 GitHub Token -> ${y`https://github.com/settings/tokens/new`}

  ${g`--root`}:      生成文章的根目录, 默认值为 ${y`posts`}

  ${g`--ext`}:       生成文件的扩展名, 默认值为 ${y`html`}，可选值 ${y`md`} 或 ${y`html`}

  ${g`--tip`}:       二维码提示文案，默认值为 ${y`长按识别二维码查看原文`}

  ${g`--title`}:     文章的脚注标题，默认值为 ${y`参考资料`}

  ${g`--labels`}:    需要生成微信文章的 labels，多个 labels 使用英文逗号 \`${y`,`}\` 分割，内置 ${y`wechat-link,wechat-post`}
               新增的 labels 只能生成微信脚注类的文章
               - wechat-link: 生成微信二维码文章（将链接转为二维码）
               - wechat-post: 生成微信脚注文章（将链接转为脚注）

about woap：${y`https://github.com/lencx/woap`}
github discussions docs：${y`https://docs.github.com/en/discussions`}`);
}
