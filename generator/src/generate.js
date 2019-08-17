
const { version } = require("../../package.json");
const fs = require("fs");
const glob = require("glob");
const chokidar = require("chokidar");
const matter = require("gray-matter");
const path = require('path');


const base = "site/content/"

function askForDocumentDefinitions() {
    // Ask their current program for document definitions
    return [{ ext: "md", metadata: matter }, { ext: "emu", metadata: matter }]
}

function scan(documentDefinitions) {
    // scan content directory for documents
    const content = glob
        .sync(base + "**/*", {})
        .filter(imagePath => !fs.lstatSync(imagePath).isDirectory())
        .map(unpackFile(documentDefinitions));
    return content
}

function unpackFile(documents) {
    return (filepath) => {
        const fullPath = filepath
        var relative = filepath.slice(base.length)
        var foundMetadata = null
        for (var i = 0; i < documents.length; i++) {
            if (relative.endsWith(documents[i].ext)) {
                foundMetadata = documents[i].metadata(fs.readFileSync(fullPath).toString())
            }
        }

        if (foundMetadata != null) {
            const metadata = {
                path: relative,
                metadata: JSON.stringify(foundMetadata.data),
                document: true
            }
            return metadata
        } else {
            const metadata = {
                path: relative,
                metadata: "",
                document: false
            }

            return metadata
        }
    }
}

function generate(scanned) {
    // Generate Pages/My/elm
    // Documents ->
    //     Routes
    //     All routes
    //     URL parser/encoder
    //     route -> metadata
    // Assets ->
    //     Record

    var docRoutes = { "_connections": {} }
    var routeRecord = {}
    var assetsRecord = {}

    var allRoutes = []
    var urlParser = []
    var routeToMetadata = []
    for (var i = 0; i < scanned.length; i++) {
        if (scanned[i].document) {
            var split = scanned[i].path
            //remove extesion and split
            split = split.replace(/\.[^/.]+$/, "").split(path.sep)
            const elmType = split.map(toPascalCase).join("")
            // captureRoutes(split, docRoutes)
            captureRouteRecord(split, elmType, routeRecord)
            allRoutes.push(elmType)
            urlParser.push(formatUrlParser(elmType, split))
            routeToMetadata.push(formatUrlToMetadata(elmType, scanned[i].metadata))

        } else {
            var split = scanned[i].path
            //remove extesion and split
            split = split.replace(/\.[^/.]+$/, "").split(path.sep)
            captureRouteRecord(split, scanned[i].path, assetsRecord)
        }

    }
    const full = formatFullElmFile({
        exposing: "(Route, all, pages, parser, routeToString, toMetadata)",
        routes: toFlatRouteType(allRoutes),
        allRoutes: formatAsElmList("all", allRoutes),
        routeRecord: toElmRecord("pages", routeRecord, true),
        urlParser: formatAsElmUrlParser(urlParser),
        urlToString: formatAsElmUrlToString(urlParser),
        routeToMetadata: formatAsMeta(routeToMetadata),
        assetsRecord: toElmRecord("assets", assetsRecord, false),
    })
    console.log(full)
}

function run() {
    const documents = askForDocumentDefinitions()
    const scanned = scan(documents)
    generate(scanned)
}

module.exports = { run };


function toFlatRouteType(routes) {
    return `type Route
    = ${routes.join("\n    | ")}
`
}

function toElmRecord(name, routeRecord, asType) {
    return name + " =\n" + formatRecord(routeRecord, asType, 1)
}

function formatRecord(rec, asType, level) {
    var keyVals = []
    const indentation = " ".repeat(level * 4)
    var valsAtThisLevel = []
    for (const key of Object.keys(rec)) {
        var val = rec[key]

        if (typeof val === 'string') {
            if (asType) {
                keyVals.push(key + " = " + val)
                valsAtThisLevel.push(val)
            } else {
                keyVals.push(key + " = \"" + val + "\"")
                valsAtThisLevel.push("\"" + val + "\"")
            }
        } else {
            keyVals.push(key + " =\n" + formatRecord(val, asType, level + 1))
        }
    }
    keyVals.push(`all = [ ${valsAtThisLevel.join(", ")} ]`)
    const indentationDelimiter = `\n${indentation}, `
    return `${indentation}{ ${keyVals.join(indentationDelimiter)}
${indentation}}`
}

function captureRouteRecord(pieces, elmType, record) {
    var obj = record
    for (i in pieces) {
        name = toCamelCase(pieces[i])
        if (parseInt(i) + 1 == pieces.length) {
            obj[name] = elmType
        } else {
            if (name in obj) {
                obj = obj[name]
            } else {
                obj[name] = {}
                obj = obj[name]
            }
        }
    }
}

function toRouteType(captured) {

    var strings = []
    // Generate type definitions
    for (const key of Object.keys(captured)) {
        if (key == "_connections") {
            continue
        }
        var str = "type " + key
        var start = true
        for (i in captured[key]) {
            if (start) {
                start = false
                str = str + "\n    = " + captured[key][i]
            } else {
                str = str + "\n    | " + captured[key][i]
            }
        }
        if (key in captured["_connections"]) {
            conns = Array.from(captured["_connections"][key].keys())
            for (i in conns) {
                if (start) {
                    start = false
                    str = str + "\n    = " + conns[i] + " " + conns[i]
                } else {
                    str = str + "\n    | " + conns[i] + " " + conns[i]
                }
            }
        }
        strings.push(str)
    }

    return strings.join("\n\n")
}

function captureRoutes(route, captured) {
    if (route == []) {
        return
    }

    var group = "Route"
    for (var i = 0; i < route.length; i++) {
        var name = toPascalCase(route[i])
        if (i + 1 == route.length) {
            if (name == "Index") {
                if (group != "Route") {
                    name = group + name
                }
            }
            if (group in captured) {
                captured[group].push(name)
            } else {
                captured[group] = [name]
            }

        } else {
            if (group in captured["_connections"]) {
                captured["_connections"][group].add(name)
            } else {
                captured["_connections"][group] = new Set()
                captured["_connections"][group].add(name)
            }
            group = name
        }
    }
}
function toPascalCase(str) {
    var pascal = str.replace(/(\-\w)/g, function (m) { return m[1].toUpperCase(); });
    return pascal.charAt(0).toUpperCase() + pascal.slice(1)
}
function toCamelCase(str) {
    var pascal = str.replace(/(\-\w)/g, function (m) { return m[1].toUpperCase(); });
    return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function formatAsElmList(name, items) {
    var formatted = items.join("\n    , ")

    var signature = name + " : List Route\n"

    return signature + name + " =\n    [ " + formatted + "\n    ]"
}

function formatPathToRouteType(filepathPieces) {
    return filepathPieces.map(toPascalCase).join(" ")
}

function literalUrl(piece) {
    return `s "${piece}"`
}

function quote(str) {
    return `"${str}"`
}

function formatUrlToMetadata(elmType, metadata) {
    return `        ${elmType} ->
            """${metadata}"""`
}

function formatAsMeta(routeToMetadata) {
    return `toMetadata: Route -> String
toMetadata route =
    case route of
${routeToMetadata.join("\n\n")}

`
}


function formatUrlParser(elmType, filepathPieces) {

    const urlParser = filepathPieces
        .map(literalUrl)
        .join(" </> ")

    const urlStringList = filepathPieces
        .map(quote)
        .join(", ")

    return {
        toString: `        ${elmType} ->\n            Url.Builder.absolute[${urlStringList} ][]`,
        parser: `Url.map ${elmType} (${urlParser})`
    }
}

function formatAsElmUrlToString(pieces) {
    var toString = pieces.map((p) => p.toString).join("\n\n")

    return `routeToString route =
    case route of
${ toString} `
}


function formatAsElmUrlParser(pieces) {
    var parser = "    [ " + pieces.map((p) => p.parser).join("\n        , ") + "\n        ]"

    return `parser =\n    Url.oneOf\n    ${parser} `
}

function formatFullElmFile(data) {
    const file = `module Pages.My exposing ${data.exposing}

{ -| -}

import Url exposing (Url)
import Url.Parser as Url exposing((</>), Parser, s, string)


${ data.routes}


${ data.allRoutes}


${ data.routeRecord}


${ data.urlParser}


${ data.urlToString}


${ data.routeToMetadata}


${ data.assetsRecord}

`
    return file

}


// ${data.routeParser}


// ${data.routeToString}