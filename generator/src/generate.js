const fs = require("fs");
const glob = require("glob");
const matter = require("gray-matter");
const path = require('path');



function askForDocumentDefinitions(dir) {
    // TODO: Ask their current Elm program for document definitions
    // we're stubbing in defaults for now.
    return [{ ext: "md", metadata: matter }, { ext: "emu", metadata: matter }]
}

function scan(dir, documentDefinitions) {
    // scan content directory for documents
    const content = glob
        .sync(dir + "**/*", {})
        .filter(imagePath => !fs.lstatSync(imagePath).isDirectory())
        .map(unpackFile(dir, documentDefinitions));
    return content
}

function unpackFile(dir, documents) {
    return (filepath) => {
        const fullPath = filepath
        var relative = filepath.slice(dir.length)
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


    var routeRecord = {}
    var assetsRecord = {}
    var allRoutes = []
    var urlParser = []
    var routeToMetadata = []
    var routeToExt = []
    var routeToSource = []
    for (var i = 0; i < scanned.length; i++) {
        var pathFragments = scanned[i].path
        //remove extesion and split into fragments
        pathFragments = pathFragments.replace(/\.[^/.]+$/, "").split(path.sep)
        const ext = path.extname(scanned[i].path)
        if (scanned[i].document) {
            const elmType = pathFragments.map(toPascalCase).join("")
            captureRouteRecord(pathFragments, elmType, routeRecord)
            allRoutes.push(elmType)
            urlParser.push(formatUrlParser(elmType, pathFragments))
            routeToMetadata.push(formatCaseInstance(elmType, scanned[i].metadata))
            routeToExt.push(formatCaseInstance(elmType, ext))
            routeToSource.push(formatCaseInstance(elmType, scanned[i].path))

        } else {
            captureRouteRecord(pathFragments, scanned[i].path, assetsRecord)
        }

    }
    return formatFullElmFile({
        exposing: "(simple, Route, all, pages, parser, routeToString, assets)",
        routes: toFlatRouteType(allRoutes),
        allRoutes: formatAsElmList("all", allRoutes),
        routeRecord: toElmRecord("pages", routeRecord, true),
        urlParser: formatAsElmUrlParser(urlParser),
        urlToString: formatAsElmUrlToString(urlParser),
        routeToMetadata: formatCaseStatement("toMetadata", routeToMetadata),
        routeToDocExtension: formatCaseStatement("toExt", routeToExt),
        routeToSource: formatCaseStatement("toSourcePath", routeToSource),
        assetsRecord: toElmRecord("assets", assetsRecord, false),
    })
}

function run(dir) {
    const documents = askForDocumentDefinitions(dir)
    const scanned = scan(dir, documents)
    return generate(scanned)
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

function formatAsElmList(name, items) {
    var formatted = items.join("\n    , ")

    var signature = name + " : List Route\n"

    return signature + name + " =\n    [ " + formatted + "\n    ]"
}

function literalUrl(piece) {
    return `s "${piece}"`
}

function quote(str) {
    return `"${str}"`
}

function formatCaseInstance(elmType, metadata) {
    return `        ${elmType} ->
            """${metadata}"""`
}

function formatCaseStatement(name, branches) {
    return `${name} : Route -> String
${name} route =
    case route of
${branches.join("\n\n")}`
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

    return `routeToString : Route -> String
routeToString route =
    case route of
${ toString} `
}


function formatAsElmUrlParser(pieces) {
    var parser = "    [ " + pieces.map((p) => p.parser).join("\n        , ") + "\n        ]"

    return `parser =\n    Url.oneOf\n    ${parser} `
}

function formatFullElmFile(data) {
    return `port module Pages.My exposing ${data.exposing}

{-| -}

import Browser
import Browser.Navigation
import Json.Encode
import Pages
import Url exposing (Url)
import Url.Parser as Url exposing ((</>), Parser, s, string)
import Http

{-| Used to tell the compile-time renderer what html headers we want for a page.

Can be used to

-}
port toCompileTimeRenderer : Json.Encode.Value -> Cmd msg


simple :
    { init : List metadata -> ( model, Cmd msg )
    , view : Maybe (Page metadata body) -> model -> Html msg
    , update : msg -> model -> ( model, Cmd msg )
    , subscriptions : model -> Sub msg
    , documents : List (Pages.Document metadata body)
    }
    -> Platform.Program (Flags userFlags) (Model userModel userMsg metadata body) (Msg userMsg metadata body)
simple config =
    Browser.application
        { init =
            \\flags url key ->
                ( emptyCache key
                , config.init []
                )
        , view =
            \\( cached, model ) ->
                view cached.current model
        , update =
            \\msg (Model model) ->
                update config.documents config.update msg model
                    |> Tuple.mapFirst Model
        , subscriptions =
            \\(Model model) ->
                Sub.batch
                    [ config.subscriptions model.userModel
                        |> Sub.map UserMsg
                    , compileTimeRendererWants CompileTimeRendererWants
                    ]
        , onUrlChange = UrlChanged
        , onUrlRequest = LinkClicked
        }


emptyCache key =
    { current = Nothing
    , previous = []
    , key = key
    }


type alias Page metadata body =
    { route : Route
    , metadata : metadata
    , body : RemoteData body
    }


type RemoteData data
    = NotAsked
    | Loading
    | Failure data
    | Success data


type alias Cache metadata body =
    -- current is Nothing if the current url is a 404
    -- then dev who is using pages can decide what to show
    { current : Maybe (Page metadata body)
    , previous : List (Page metadata body)
    , key : Browser.Navigation.Key
    }


loadPageBody : Route -> body -> Cache metadata body -> Cache metadata body
loadPageBody route body cache =
    let
        loadBody page =
            if page.route == route then
                { page | body = Success body }

            else
                page
    in
    { cache
        | current = Maybe.map loadBody cache.current
        , previous = List.map loadBody cache.previous
    }
    

gotoCachedRoute : Route -> List (Document metadata body) -> Cache metadata body -> ( Cache metadata body, Cmd Msg )
gotoCachedRoute route documents cache =
    let
        currentPageIsSame =
            case cache.current of
                Nothing ->
                    False

                Just current ->
                    current.route == route
    in
    if currentPageIsSame then
        ( cache, Cmd.none )

    else
        case getDocument route documents of
            Nothing ->
                -- TODO, report error
                ( cache, Cmd.none )

            Just doc ->
                let
                    matchPage page ( found, prevs ) =
                        case found of
                            Nothing ->
                                if page.route == route then
                                    ( Just page, prevs )

                                else
                                    ( Nothing, page :: prevs )

                            Just _ ->
                                ( found, page :: prevs )

                    ( maybeExistingPage, newPrevious ) =
                        List.foldl matchPage ( Nothing, [] ) cache.previous

                    newCurrentPage =
                        Maybe.withDefault
                            { route = route
                            , metadata = doc.metadata (toMetadata route)
                            , body = Loading
                            }
                            maybeExistingPage
                in
                ( { cache
                    | current = newCurrentPage
                    , previous = List.reverse newPrevious
                    }
                , case newCurrentPage.body of
                    Loading ->
                        getPage GotPage route doc

                    _ ->
                        Cmd.none
                )


getPage toMsg route doc =
    Http.get
        { url = toSourcePath route
        , expect =
            Http.expectStringResponse toMsg <|
                \\response ->
                    case response of
                        Http.BadUrl_ url ->
                            Err (Http.BadUrl url)

                        Http.Timeout_ ->
                            Err Http.Timeout

                        Http.NetworkError_ ->
                            Err Http.NetworkError

                        Http.BadStatus_ metadata body ->
                            Err (Http.BadStatus metadata.statusCode)

                        Http.GoodStatus_ metadata body ->
                            case doc.body (doc.metadata (toMetadata route)) body of
                                Ok value ->
                                    Ok value

                                Err err ->
                                    Err (Http.BadBody "Unable to parse body.")
        }


getDocument : Route -> List (Document metadata body) -> Maybe (Document metadata body)
getDocument route docs =
    let
        ext =
            toExt route
    in
    List.filter (\\doc -> doc.ext == ext) docs
        |> List.head


type Msg userMsg metadata body
    = LinkClicked Browser.UrlRequest
    | UrlChanged Url.Url
    | UserMsg userMsg
    | GotPageBody Route (Result Http.Error body)


update :
    List (Document metadata body)
    -> (userMsg -> model -> ( model, Cmd userMsg ))
    -> Msg userMsg metadata body
    -> ( Cache metadata body, Model )
    -> ( ( Cache metadata body, Model ), Cmd Msg )
update documents userUpdate msg (( cache, model ) as existing) =
    case msg of
        UserMsg userMsg ->
            let
                ( userModel, userCmd ) =
                    userUpdate userMsg model
            in
            ( ( cache, userModel )
            , Cmd.map UserMsg userCmd
            )

        LinkClicked urlRequest ->
            case urlRequest of
                Browser.Internal url ->
                    let
                        navigatingToSamePage =
                            url.path == model.url.path
                    in
                    if navigatingToSamePage then
                        -- this is a workaround for an issue with anchor fragment navigation
                        -- see https://github.com/elm/browser/issues/39
                        ( existing, Browser.Navigation.load (Url.toString url) )

                    else
                        ( existing, Browser.Navigation.pushUrl model.key (Url.toString url) )

                Browser.External href ->
                    ( existing, Browser.Navigation.load href )

        UrlChanged url ->
            let
                ( newCache, loadPageIfNecessary ) =
                    gotoCachedRoute (parser url) documents cache
            in
            ( ( newCache, model )
            , loadPageIfNecessary
            )

        GotPageBody route newPageBodyResult ->
            case newPageBodyResult of
                Ok newPageBody ->
                    ( (loadPageBody route newPageBody cache, model)
                    , Cmd.none
                    )

                Err _ ->
                    -- TODO handle error
                    -- If in dev mode, display in view
                    -- if in production, optionally log to server?
                    ( existing, Cmd.none )


{- PAGES -}

${ data.routes}


${ data.allRoutes}


${ data.routeRecord}


${ data.urlParser}


${ data.urlToString}


${ data.routeToMetadata}


${ data.routeToDocExtension}


${ data.routeToSource}


{- ASSETS -}


${ data.assetsRecord}

`
}

// String case handlers

function toPascalCase(str) {
    var pascal = str.replace(/(\-\w)/g, function (m) { return m[1].toUpperCase(); });
    return pascal.charAt(0).toUpperCase() + pascal.slice(1)
}
function toCamelCase(str) {
    var pascal = str.replace(/(\-\w)/g, function (m) { return m[1].toUpperCase(); });
    return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}
