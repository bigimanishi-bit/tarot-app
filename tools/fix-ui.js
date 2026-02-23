// tools/fix-ui.js
// 目的：
// - 枠外の右上ナビ（/new /read /logout など）を各ページから削除
// - COSMIC TAROT を Tarot Studio に戻す
// - app/layout.tsx の header を削除（枠外ヘッダー排除）
//
// 使い方：node tools/fix-ui.js

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

const targets = [
  "app/chat/page.tsx",
  "app/new/page.tsx",
  "app/read/page.tsx",
  "app/read/[id]/page.tsx",
  "app/login/page.tsx",
  "app/layout.tsx",
];

function readFile(p) {
  return fs.readFileSync(path.join(ROOT, p), "utf8");
}
function writeFile(p, s) {
  fs.writeFileSync(path.join(ROOT, p), s, "utf8");
}

function replaceBrand(s) {
  return s.replace(/COSMIC TAROT/g, "Tarot Studio");
}

function removeLayoutHeader(s) {
  // <header ...> ... </header> を全部消す（layoutだけ）
  return s.replace(/\n\s*<header[\s\S]*?<\/header>\n/g, "\n");
}

function removeOuterNavBlocks(s) {
  let out = s;

  // パターンA：mb-5 で始まる枠外ナビ（classの中身や順序が変わってても消す）
  out = out.replace(/\n\s*<div className="mb-5[^"]*">[\s\S]*?<\/div>\n/g, "\n");

  // パターンB：pill rounded-full を複数持つ “枠外の右上ナビ” ブロックを消す
  // （中に /new や /read がある想定。Link/buttonの混在に対応）
  out = out.replace(
    /\n\s*<div className="[^"]*justify-end[^"]*">[\s\S]*?<\/div>\n/g,
    (block) => {
      const hasPill = /className="pill rounded-full/.test(block);
      const hasNewOrRead = /href="\/new"|href="\/read"|href="\/chat"/.test(block);
      const hasLogout = /ログアウト|logout/i.test(block);
      if (hasPill && (hasNewOrRead || hasLogout)) return "\n";
      return block;
    }
  );

  return out;
}

function main() {
  const changed = [];

  for (const file of targets) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;

    let src = readFile(file);
    let out = src;

    out = replaceBrand(out);
    out = removeOuterNavBlocks(out);

    if (file === "app/layout.tsx") {
      out = removeLayoutHeader(out);
    }

    if (out !== src) {
      writeFile(file, out);
      changed.push(file);
    }
  }

  console.log("Done.");
  if (changed.length === 0) {
    console.log("No changes (patterns not found).");
  } else {
    console.log("Changed files:");
    for (const f of changed) console.log(" - " + f);
  }
}

main();