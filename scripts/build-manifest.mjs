import { readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "data");
const outFile = path.join(dataDir, "books.json");

const collator = new Intl.Collator("zh-Hans-CN", {
  numeric: true,
  sensitivity: "base",
});

const categoryMatchers = [
  ["妇幼儿科", /女科|妇|产|胎|婴|儿|幼|小儿|保婴|痘疹|麻疹|痧疹|毓麟|坤|竹泉生女科/u],
  ["针灸经络", /针|灸|经络|经穴|穴|推拿|按摩|导引|铜人|流注/u],
  ["五官喉科", /眼|目|银海|喉|口齿|白喉|舌备/u],
  ["外伤外科", /外科|疡|伤科|跌打|损伤|正骨|接骨|金疮|疮|背疽|理伤/u],
  ["伤寒温病", /伤寒|金匮|温病|温热|瘟|疫|暑|霍乱|疟|热病|寒论|三时伏气/u],
  ["经典医经", /黄帝|内经|素问|灵枢|难经|医经|太素|八十一难/u],
  ["诊法脉学", /脉|诊|舌|望诊|形色|察病|察舌|三指禅/u],
  ["本草食养", /本草|药|食|饮膳|炮炙|炮制|雷公|珍珠囊|药性|汤液|花韵/u],
  ["方剂方书", /方|剂|汤头|奇效|普济|圣济|惠民|济生|经验|验方|良方|秘方|集验|外治/u],
  ["医案医话", /医案|验案|医话|临证|方案|寓意草|名师|垂教|余举隅|衷中参西录/u],
  ["养生保健", /养生|寿世|养老|导引|易筋经|洗髓|饮食|卫生|性命|修昆仑/u],
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await createManifest(root);
  await writeManifest(outFile, manifest);
  console.log(`Wrote ${path.relative(root, outFile)} with ${manifest.books.length} books.`);
}

export async function createManifest(sourceRoot) {
  const files = (await readdir(sourceRoot))
    .filter((file) => file.endsWith(".txt"))
    .filter((file) => !file.includes(".baiduyun."))
    .sort((a, b) => collator.compare(a, b));

  const books = [];
  let totalBytes = 0;

  for (const file of files) {
    const fullPath = path.join(sourceRoot, file);
    const info = await stat(fullPath);
    const parsed = parseBookName(file);
    const category = classify(parsed.title);

    totalBytes += info.size;
    books.push({
      id: parsed.id,
      code: parsed.code,
      title: parsed.title,
      file,
      size: info.size,
      category,
    });
  }

  books.sort((a, b) => a.id - b.id || collator.compare(a.file, b.file));

  const categoryCounts = new Map();
  for (const book of books) {
    categoryCounts.set(book.category, (categoryCounts.get(book.category) || 0) + 1);
  }

  const categories = [...categoryCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));

  return {
    generatedAt: new Date().toISOString(),
    count: books.length,
    totalBytes,
    textEncoding: "GB18030/GBK text files decoded client-side with UTF-8 fallback",
    categories,
    books,
  };
}

export async function writeManifest(filePath, manifest) {
  await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function parseBookName(file) {
  const base = file.replace(/\.txt$/u, "");
  const match = base.match(/^(\d+)[-.](.+)$/u);
  if (!match) {
    return {
      id: Number.MAX_SAFE_INTEGER,
      code: "",
      title: base,
    };
  }

  const id = Number.parseInt(match[1], 10);
  return {
    id,
    code: match[1].padStart(3, "0"),
    title: match[2].trim(),
  };
}

function classify(title) {
  for (const [category, pattern] of categoryMatchers) {
    if (pattern.test(title)) {
      return category;
    }
  }
  return "综合医论";
}
