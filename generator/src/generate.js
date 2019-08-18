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
    return {
        exposing: "(simple, Route, all, pages, urlParser, routeToString, assets)",
        routes: toFlatRouteType(allRoutes),
        allRoutes: formatAsElmList("all", allRoutes),
        routeRecord: toElmRecord("pages", routeRecord, true),
        urlParser: formatAsElmUrlParser(urlParser),
        urlToString: formatAsElmUrlToString(urlParser),
        routeToMetadata: formatCaseStatement("toMetadata", routeToMetadata),
        routeToDocExtension: formatCaseStatement("toExt", routeToExt),
        routeToSource: formatCaseStatement("toSourcePath", routeToSource),
        assetsRecord: toElmRecord("assets", assetsRecord, false),
    }
}

function run(dir) {
    const documents = askForDocumentDefinitions(dir)
    const scanned = scan(dir, documents)
    return formatFullElmFile(generate(scanned))
}

function runInternal(dir) {
    const documents = askForDocumentDefinitions(dir)
    const scanned = scan(dir, documents)
    return renderInternalVersionOfMy(generate(scanned))
}

module.exports = { run, runInternal };


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
        toString: `        ${elmType} ->\n            Url.Builder.absolute [ ${urlStringList} ] []`,
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

    return `urlParser =\n    Url.oneOf\n    ${parser} `
}

function formatFullElmFile(data) {
    return `port module My exposing ${data.exposing}

{-| -}

import Browser
import Browser.Navigation
import Json.Encode
import Json.Decode
import Pages
import Url exposing (Url)
import Url.Parser as Url exposing ((</>), Parser, s, string)
import Http
import Html exposing (Html)
import Html.Lazy
import Url.Builder
import Url.Parser


{-| Used to tell the compile-time renderer what html headers we want for a page.

Can be used to

-}
port toCompileTimeRenderer : Json.Encode.Value -> Cmd msg


--type alias Program flags model msg metadata body =
--    Platform.Program flags (Cache metadata body, model) (Msg msg body)

simple :
    { init : List metadata -> ( model, Cmd msg )
    , view : Maybe (Page metadata body) -> model -> Html msg
    , update : msg -> model -> ( model, Cmd msg )
    , subscriptions : model -> Sub msg
    , documents : List (Pages.Document metadata body)
    }
    -> Platform.Program flags (Cache metadata body, model) (Msg msg body)
simple config =
    Browser.application
        { init =
            \\flags url key ->
                let
                    (userModel, userCmd) =
                        -- TODO, render all metadata, reporting any parinsg errors
                        config.init []
                in
                (( emptyCache url key
                 , userModel
                 )
                , Cmd.map UserMsg userCmd
                )
        , view =
            \\( cached, model ) ->
                let
                    {body, title} = config.view cached.current model
                in
                { title = title
                , body = List.map (Html.map UserMsg) body
                }
        , update =
            update config.documents config.update 
        , subscriptions =
            \\(cache, model) ->
                Sub.batch
                    [ Sub.map UserMsg (config.subscriptions model) 
                    -- , compileTimeRendererWants CompileTimeRendererWants
                    ]
        , onUrlChange = UrlChanged
        , onUrlRequest = LinkClicked
        }


emptyCache url key =
    { current = Nothing
    , previous = []
    , key = key
    , url = url
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
    , url : Url.Url
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
    

gotoCachedRoute : 
    Maybe Route
    -> List (Pages.Document metadata body)
    -> Cache metadata body
    -> ( Cache metadata body, Cmd (Msg msg body) )
gotoCachedRoute maybeRoute documents cache =
    let
        currentPageIsSame =
            Maybe.map .route cache.current
                == maybeRoute
    in
    if currentPageIsSame then
        ( cache, Cmd.none )

    else
        case maybeRoute of
            Nothing ->
                ( cache, Cmd.none )


            Just route ->
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


                            ( newCurrentPage, newPrevious ) =
                                List.foldl matchPage ( Nothing, [] ) cache.previous
                                    |> Tuple.mapFirst createNewPage


                            createNewPage maybeExistingPage =
                                case maybeExistingPage of
                                    Nothing ->
                                        case Json.Decode.decodeString doc.metadata (toMetadata route) of
                                            Ok newMeta ->
                                                Just
                                                    { route = route
                                                    , metadata = newMeta
                                                    , body = Loading
                                                    }

                                            Err err ->
                                                Nothing

                                    Just existing ->
                                        maybeExistingPage

                        in
                        ( { cache
                            | current = newCurrentPage
                            , previous = List.reverse newPrevious
                            }
                        , case Maybe.map .body newCurrentPage of
                            Just Loading ->
                                getPage (GotPageBody route) route doc

                            _ ->
                                Cmd.none
                        )

getPage : 
    (Result Http.Error body -> Msg userMsg body)
    -> Route
    -> Pages.Document metadata body
    -> Cmd (Msg userMsg body)
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
                            case Json.Decode.decodeString doc.metadata (toMetadata route) of
                                Ok docMetadata ->
                                    Ok (doc.body docMetadata body)

                                Err err ->
                                    Err (Http.BadBody "Unable to parse metadata.")
        }


getDocument : Route -> List (Pages.Document metadata body) -> Maybe (Pages.Document metadata body)
getDocument route docs =
    let
        ext =
            toExt route
    in
    List.filter (\\doc -> doc.ext == ext) docs
        |> List.head


type Msg userMsg body
    = LinkClicked Browser.UrlRequest
    | UrlChanged Url.Url
    | UserMsg userMsg
    | GotPageBody Route (Result Http.Error body)


update :
    List (Pages.Document metadata body)
    -> (userMsg -> model -> ( model, Cmd userMsg ))
    -> Msg userMsg body
    -> ( Cache metadata body, model )
    -> ( ( Cache metadata body, model ), Cmd (Msg userMsg body))
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
                            url.path == cache.url.path
                    in
                    if navigatingToSamePage then
                        -- this is a workaround for an issue with anchor fragment navigation
                        -- see https://github.com/elm/browser/issues/39
                        ( existing, Browser.Navigation.load (Url.toString url) )

                    else
                        ( existing, Browser.Navigation.pushUrl cache.key (Url.toString url) )

                Browser.External href ->
                    ( existing, Browser.Navigation.load href )

        UrlChanged url ->
            let
                ( newCache, loadPageIfNecessary ) =
                    gotoCachedRoute (Url.Parser.parse urlParser url) documents cache
            in
            ( ( { newCache | url = url }, model )
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





/*

    This version of the renderer is intended to be API compatible with the normal `My.elm`,
    However this version is made exclusively so that elm-pages can ask it questions


*/
function renderInternalVersionOfMy(data) {
    return `port module My exposing ${data.exposing}

{-| -}

import Browser
import Browser.Navigation
import Json.Encode
import Json.Decode
import Pages
import Url exposing (Url)
import Url.Parser as Url exposing ((</>), Parser, s, string)
import Http
import Html exposing (Html)
import Html.Lazy
import Url.Builder
import Url.Parser


{-| Send messages to the compile time renderer.
-}
port toCompileTimeRenderer : Json.Encode.Value -> Cmd msg


encodeForRenderer docs =
    Json.Encode.string "Hello!"

simple :
    { init : List metadata -> ( model, Cmd msg )
    , view : Maybe (Page metadata body) -> model -> Html msg
    , update : msg -> model -> ( model, Cmd msg )
    , subscriptions : model -> Sub msg
    , documents : List (Pages.Document metadata body)
    }
    -> Platform.Program flags (Cache metadata body, model) (Msg msg body)
simple config =
    Platform.worker
        { init =
            \\flags ->
                let
                    (userModel, _) =
                        config.init []
                in
                (( Cache
                 , userModel
                 )
                , toCompileTimeRenderer (encodeForRenderer config.documents)
                )
        , update =
            \\msg model ->
                (model, Cmd.none)
        , subscriptions =
            \\(cache, model) ->
                -- compileTimeRendererWants CompileTimeRendererWants
                Sub.none
        }


type Msg userMsg body
    = SendToCompileTimeRenderer Json.Encode.Value

{-| We've stubbed these to ensure our interface is complete,  -}
type Cache metadata body = Cache

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