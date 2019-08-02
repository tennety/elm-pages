module Pages.My exposing
    ( Articles(..)
    , Route(..)
    , all
    , parser
    , routeToString
    )

{-| -}

import Mark
import Url exposing (Url)
import Url.Parser as Url exposing ((</>), Parser, s, string)


type Route
    = About
    | ArticlesIndex
    | Articles Articles


type Articles
    = MovingFasterWithTinySteps


{-| `metadata` type is defined by the user in their document parser
-}
type alias Page metadata =
    { route : Route
    , meta : metadata
    }


type Parsed metadata
    = Unparsed Json.Value
    | Parsed metadata


{-| It'd be nice if we could ensure this was only run once.
-}
all : (String -> metadata) -> List (Page metadata)
all metadataParser =
    List.map (runMetadataParser metadataParser)
        [ { route = About
          , meta =
                Unparsed """|> Article
    title = How I Learned /elm-markup/
    description = How I learned to use elm-markup."""
          }
        , { route = ArticlesIndex
          , meta = """|> Article
    title = How I Learned /elm-markup/
    description = How I learned to use elm-markup."""
          }
        , { route = Articles MovingFasterWithTinySteps
          , meta = """|> Article
    title = Moving Faster with Tiny Steps in Elm
    description = How I learned to use elm-markup."""
          }
        ]


runMetadataParser parser pseudoPage =
    { route = pseudoPage.route
    , meta = parser pseudoPage.meta
    }


parser : Url.Parser (Route -> a) a
parser =
    Url.oneOf
        [ Url.map About (s "about")
        , Url.map (Articles MovingFasterWithTinySteps) (s "articles" </> s "moving-faster-with-tiny-steps")
        , Url.map ArticlesIndex (s "articles")
        ]


routeToString : Route -> String
routeToString page =
    case page of
        About ->
            Url.Builder.absolute [ "about" ] []

        ArticlesIndex ->
            Url.Builder.absolute [ "articles" ] []

        Articles MovingFasterWithTinySteps ->
            Url.Builder.absolute [ "articles", "moving-faster-with-tiny-steps" ] []


{--}
type Metadata
    = Image
    | Markup



{- Static Assets -}


images =
    { mountains = "images/mountains.jpg"
    }


{-| -}
imageSource =
    Mark.oneOf
        [ exactly images.mountains
        , external
        ]


exactly actual =
    Mark.string
        |> Mark.verify
            (\src ->
                if actual == src then
                    Ok src

                else
                    Err
                        { title = "Could not find image `" ++ src ++ "`"
                        , message =
                            [ "Must be one of\n"
                            ]
                        }
            )


external =
    Mark.string
        |> Mark.verify
            (\src ->
                if src |> String.startsWith "http" then
                    Ok src

                else
                    Err
                        { title = "Could not image `" ++ src ++ "`"
                        , message =
                            [ "Must be one of\n"
                            , Dict.keys imageAssets |> String.join "\n"
                            ]
                        }
            )
