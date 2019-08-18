#!/usr/bin/env node

const { Elm } = require("./Main.js");
const { version } = require("../../package.json");

const fs = require("fs");
const glob = require("glob");
const develop = require("./develop.js");
const chokidar = require("chokidar");
const matter = require("gray-matter");
const generate = require("./generate.js")

const contentGlobPath = "content/**/*.emu";

let watcher = null;

function unpackFile(path) {
  return { path, contents: fs.readFileSync(path).toString() };
}

function parseMarkdown(path, fileContents) {
  const { content, data } = matter(fileContents);
  return { path, metadata: JSON.stringify(data), body: content };
}


function run() {
  console.log("Running elm-pages...");

  // New File Generation
  // Uncomment to generate the new file
  // const myElmFile = generate.run("site/content/")
  // fs.mkdirSync('./site/my', { recursive: true }, (err) => {
  //   if (err) throw err;
  // });
  // fs.writeFileSync("./site/my/My.elm", myElmFile);

  // Create our stubbed in version of the file
  const myInternalElmFile = generate.runInternal("site/content/")

  // Read elm.json file and rewrite it can live in `elm-stuff`
  // with a new, stubbed `My.elm` file
  var elmJson = JSON.parse(fs.readFileSync("./site/elm.json").toString())

  var newElmJson = rewriteElmJson(elmJson)

  // create target dirs
  fs.mkdirSync('./site/elm-stuff/generated-code/dillonkearns/elm-pages', { recursive: true }, (err) => {
    if (err) throw err;
  });
  // write new elm.json
  fs.writeFileSync("./site/elm-stuff/generated-code/dillonkearns/elm-pages/elm.json", JSON.stringify(newElmJson));
  // write stubbed in My.elm
  fs.writeFileSync("./site/elm-stuff/generated-code/dillonkearns/elm-pages/My.elm", myInternalElmFile);

  // Then you can cd to ./site/elm-stuff/generated-code/dillonkearns/elm-pages/
  // and run elm make ../../../../OriginalMain.elm
  // and it'll create a platform worker version instead.



  // const content = glob.sync(contentGlobPath, {}).map(unpackFile);
  // const markdownContent = glob
  //   .sync("content/**/*.md", {})
  //   .map(unpackFile)
  //   .map(({ path, contents }) => {
  //     return parseMarkdown(path, contents);
  //   });
  // const images = glob
  //   .sync("images/**/*", {})
  //   .filter(imagePath => !fs.lstatSync(imagePath).isDirectory());

  // let app = Elm.Main.init({
  //   flags: {
  //     argv: process.argv,
  //     versionMessage: version,
  //     content,
  //     markdownContent,
  //     images
  //   }
  // });

  // app.ports.printAndExitSuccess.subscribe(message => {
  //   console.log(message);
  //   process.exit(0);
  // });

  // app.ports.printAndExitFailure.subscribe(message => {
  //   console.log(message);
  //   process.exit(1);
  // });

  // app.ports.writeFile.subscribe(contents => {
  //   fs.writeFileSync("./gen/RawContent.elm", contents.rawContent);
  //   fs.writeFileSync("./src/js/image-assets.js", contents.imageAssets);
  //   console.log("elm-pages DONE");
  //   if (contents.watch) {
  //     startWatchIfNeeded();
  //     develop.start({ routes: contents.routes, debug: contents.debug });
  //   } else {
  //     develop.run(
  //       { routes: contents.routes, fileContents: contents.fileContents },
  //       () => { }
  //     );
  //   }
  // });
}

run();

function startWatchIfNeeded() {
  if (!watcher) {
    console.log("Watching...");
    watcher = chokidar
      .watch([contentGlobPath, "content/**/*.md"], {
        awaitWriteFinish: {
          stabilityThreshold: 500
        },
        ignoreInitial: true
      })
      .on("all", function (event, filePath) {
        console.log(`Rerunning for ${filePath}...`);
        run();
        console.log("Done!");
      });
  }
}

// 
function rewriteElmJson(elmJson) {
  // The internal generated file will be at:
  // ./elm-stuff/generated-code/dillonkearns/elm-pages
  // So, we need to take the existing elmJson and
  // 1. remove existing path that looks at `My.elm`
  elmJson["source-directories"] =
    elmJson["source-directories"].filter((item) => {
      return item != "my"
    })
  // 2. prepend ../../../ to remaining 
  elmJson["source-directories"] = elmJson["source-directories"].map((item) => {
    return "../../../../" + item
  })
  // 3. add our own secret My.elm module 😈
  elmJson["source-directories"].push(".")
  return elmJson

}