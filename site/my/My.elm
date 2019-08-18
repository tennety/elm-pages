port module My exposing (simple, Route, all, pages, urlParser, routeToString, assets)

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
            \flags url key ->
                let
                    (userModel, userCmd) = config.init []
                in
                (( emptyCache url key
                 , userModel
                 )
                , Cmd.map UserMsg userCmd
                )
        , view =
            \( cached, model ) ->
                { title = ""
                , body = [ Html.map UserMsg (Html.Lazy.lazy2 config.view cached.current model) ]
                }
        , update =
            update config.documents config.update 
        , subscriptions =
            \(cache, model) ->
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
                \response ->
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
    List.filter (\doc -> doc.ext == ext) docs
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

type Route
    = About
    | ArticlesIndex
    | ArticlesMovingFasterWithTinySteps
    | Markdown



all : List Route
all =
    [ About
    , ArticlesIndex
    , ArticlesMovingFasterWithTinySteps
    , Markdown
    ]


pages =
    { about = About
    , articles =
        { index = ArticlesIndex
        , movingFasterWithTinySteps = ArticlesMovingFasterWithTinySteps
        , all = [ ArticlesIndex, ArticlesMovingFasterWithTinySteps ]
        }
    , markdown = Markdown
    , all = [ About, Markdown ]
    }


urlParser =
    Url.oneOf
        [ Url.map About (s "about")
        , Url.map ArticlesIndex (s "articles" </> s "index")
        , Url.map ArticlesMovingFasterWithTinySteps (s "articles" </> s "moving-faster-with-tiny-steps")
        , Url.map Markdown (s "markdown")
        ] 


routeToString : Route -> String
routeToString route =
    case route of
        About ->
            Url.Builder.absolute [ "about" ] []

        ArticlesIndex ->
            Url.Builder.absolute [ "articles", "index" ] []

        ArticlesMovingFasterWithTinySteps ->
            Url.Builder.absolute [ "articles", "moving-faster-with-tiny-steps" ] []

        Markdown ->
            Url.Builder.absolute [ "markdown" ] [] 


toMetadata : Route -> String
toMetadata route =
    case route of
        About ->
            """{}"""

        ArticlesIndex ->
            """{}"""

        ArticlesMovingFasterWithTinySteps ->
            """{}"""

        Markdown ->
            """{"title":"This is a markdown article"}"""


toExt : Route -> String
toExt route =
    case route of
        About ->
            """.emu"""

        ArticlesIndex ->
            """.emu"""

        ArticlesMovingFasterWithTinySteps ->
            """.emu"""

        Markdown ->
            """.md"""


toSourcePath : Route -> String
toSourcePath route =
    case route of
        About ->
            """about.emu"""

        ArticlesIndex ->
            """articles/index.emu"""

        ArticlesMovingFasterWithTinySteps ->
            """articles/moving-faster-with-tiny-steps.emu"""

        Markdown ->
            """markdown.md"""


{- ASSETS -}


assets =
    { all = [  ]
    }

