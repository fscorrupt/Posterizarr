<a name="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/fscorrupt/Posterizarr">
    <img src="/images/webhook.png" alt="Logo" width="100" height="100">
  </a>

<h1 align="center">Posterizarr</h1>

  <p align="center">
    <a href="https://github.com/fscorrupt/Posterizarr/issues">Report Bug</a>
    ·
    <a href="https://github.com/fscorrupt/Posterizarr/issues">Request Feature</a>
  </p>
</div>
<p align="center">
    <a href="https://ko-fi.com/R6R81S6SC" target="_blank"><img src="https://storage.ko-fi.com/cdn/brandasset/logo_white_stroke_small.png" alt="Buy Me A Coffee" height="35"></a>
    <a href="https://discord.gg/fYyJQSGt54" target="_blank"><img src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" alt="Discord" height="35"></a>
</p>
<p align="center">
<a href="https://discord.gg/fYyJQSGt54" target="_blank"><img src="/images/posterizarr_banner.jpg" alt="Discord" height="10%"></a>
</p>
<br>

## Supported Platforms 💻

[![Docker](https://img.shields.io/static/v1?style=for-the-badge&logo=docker&logoColor=FFFFFF&message=docker&color=1E63EE&label=)](walkthrough.md)
[![Unraid](https://img.shields.io/static/v1?style=for-the-badge&logo=unraid&logoColor=FFFFFF&message=unraid&color=E8402A&label=)](walkthrough.md)
[![Linux](https://img.shields.io/static/v1?style=for-the-badge&logo=linux&logoColor=FFFFFF&message=Linux&color=0D597F&label=)](walkthrough.md)
[![Windows](https://img.shields.io/static/v1?style=for-the-badge&logo=windows&logoColor=FFFFFF&message=windows&color=097CD7&label=)](walkthrough.md)
[![MacOS](https://img.shields.io/static/v1?style=for-the-badge&logo=apple&logoColor=FFFFFF&message=macOS&color=515151&label=)](walkthrough.md)
[![ARM](https://img.shields.io/static/v1?style=for-the-badge&logo=arm&logoColor=FFFFFF&message=ARM&color=815151&label=)](walkthrough.md)

## Introduction
This PowerShell  automates the process of generating images for your Plex/Jellyfin/Emby media library. Leveraging information from your Plex/Jellyfin/Emby library, such as movie or show titles, season and episode data, it fetches relevant artwork from Fanart.tv, TMDB, TVDB, Plex and IMDB. The  is able to focus on artwork with specific languages to grab. By default, textless artwork `xx` is retrieved and will fall back to `en` if textless is not found. This is a setting a user can decide on, either to focus on textless or on text posters. It also offers both automatic and manual modes for generating posters. The manual mode can accommodate custom creations that cannot be bulk retrieved.

> [!NOTE]
Posterizarr is cross-platform ready, meaning it can run on Linux, [Docker (Alpine Base Image)](#docker), [unRAID](#unraid) and on Windows operating systems.
>
> **Supported Poster Types:**
>- Movie/Show Posters
>- Movie/Show Backgrounds
>- Season Posters
>- TitleCards

## 📚 Table of Contents

- [🚀 Walkthrough](#walkthrough---how-to)
- [⚙️ Configuration](#configuration)
- [🧪 Usage](#usage)
- [📌 Main Capabilities of Posterizarr](#main-capabilities-of-posterizarr)
  - [🤖 Automatic Mode](#automatic-mode)
  - [🖼️ Asset Tips](#assets-tip)
  - [✍️ Manual Assets Naming](#manual-assets-naming)
- [🧩  Modes](#scipt-modes)
  - [🐳 Tautulli Mode Docker](#tautulli-mode-docker)
  - [🪟 Tautulli Mode Windows](#tautulli-mode-windows)
  - [🧪 Testing Mode](#testing-mode)
  - [🛠️ Manual Mode](#manual-mode)
  - [💾 Backup Mode](#backup-mode)
  - [🖼️ Poster reset Mode](#poster-reset-mode)
  - [🔄 Sync Modes](#sync-modes)
- [🧰 Platforms & Tools](#platforms--tools)
  - [🐳 Docker](#docker)
  - [🧲 unRAID](#unraid)
  - [📺 Jellyfin](#jellyfin)
  - [🔔 Webhook](#webhook)
  - [🖼️ Example Pictures](#example-pictures)
  - [🧪 Images from Testing Mode](#images-from-testing-mode)
  - [📑 Brief Overview of Key Settings](#brief-overview-of-key-settings)
  - [📊 How to create the Posterizarr.xlsm](#how-to-create-the-posterizarrxlsm)
  - [🧭 How to use the Posterizarr.xlsm](#how-to-use-the-posterizarrxlsm)
- [🔍 Search Order](#search-order)
- [📬 PR Rules](#pr-rules)
- [🎉 Enjoy](#enjoy)


## Walkthrough - How-To
> [!TIP]
> Here is an installation [walkthrough](walkthrough.md)

> [!IMPORTANT]
> Do not enable more then one media server.
>
> If you want to install it on ARM please follow this carefully [ARM prerequisites](walkthrough.md#arm-prerequisites)


> [!WARNING]
>- The `temp` Folder gets cleared on every Script run, so do not put files into it.
>- **[Apprise](https://github.com/caronc/apprise/wiki)** integration only works in docker container, please use discord on other platforms **(discord also works on docker)**.
>- **Please start the script as Admin on first run, otherwise the script is not able to install the prerequisites.**

> [!NOTE]
>Upon initial execution, the script may take some time to run as it compiles necessary data. Subsequent runs will look at whether a poster in the AssetPath is missing and only create missing posters, bypassing existing assets in the directory. If you are unhappy with the downloaded artwork, delete it in the AssetPath directory, rerun and the script will populate the missing artwork.

> [!IMPORTANT]
>**Requirements:**
>
>Before utilizing the script, ensure the following prerequisites are installed and configured:

>- **TMDB API Read Access Token:** [Obtain TMDB API Token](https://www.themoviedb.org/settings/api)
    - **NOTE** the **TMDB API Read Access Token** is the really, really long one
>- **Fanart Personal API Key:** [Obtain Fanart API Key](https://fanart.tv/get-an-api-key)
>- **TVDB API Key:** [Obtain TVDB API Key](https://thetvdb.com/api-information/signup)
    - **Do not** use `"Legacy API Key"`, it only works with a Project Api Key.
>- **ImageMagick:**
    - **Version 7.x is required** - The script handles downloading and using a portable version of ImageMagick for all platforms. **(You may need to run the Script as Admin on first run)**. If you prefer to reference your own installation or prefer to download and install it yourself (already integrated in container), goto: [Download ImageMagick](https://imagemagick.org/script/download.php)
>- **Powershell Version:** 5.x or higher (already integrated in container).
>- **FanartTv Powershell Module:** This module is required (already integrated in container), goto: [Install Module](https://github.com/Celerium/FanartTV-PowerShellWrapper)

# Configuration

1. Open `config.example.json` located in the script directory.
2. Update the following variables with your API keys and preferences [my personal config](MyPersonalConfig.json):

    <details close>
    <summary>ApiPart [click to unfold]</summary>
    <br>

    - `tvdbapi`: Your TVDB Project API key.
       - If you are a TVDB subscriber, you can append your PIN to the end of your API key in the format `YourApiKey#YourPin`. (It is important to include a `#` between the API key and the PIN.)
    - `tmdbtoken`: Your TMDB API Read Access Token.
    - `FanartTvAPIKey`: Your Fanart personal API key.
    - `PlexToken`: Your Plex token (Leave empty if not applicable).
    - `JellyfinAPIKey`: Your Jellyfin API key. (You can create an API key from inside Jellyfin at Settings > Advanced > Api Keys.)
    - `EmbyAPIKey`: Your Emby API key. (You can create an API key from inside Emby at Settings > Advanced > Api Keys.)
    - `FavProvider`: Set your preferred provider (default is `tmdb`).
        - possible values are:
            -    `tmdb` (recommended)
            -    `fanart`
            -    `tvdb`
            -    `plex` (Not recommended)
                  - if you prefer textless, do not set plex as fav provider as i cannot query if it has text or not.
                  - that beeing said, plex should act as last resort like IMDB does for Movies and not as fav provider.

            [Search order in script](#Search-Order)
    - `WidthHeightFilter`: If set to `true`, an additional resolution filter will be applied to Posters/Backgrounds (TMDB and TVDB) and Titlecards (only on TMDB) searches.
    - `PosterMinWidth`: Minimum poster width filter—greater than or equal to: `2000` (default value)
    - `PosterMinHeight`: Minimum poster height filter—greater than or equal to: `3000` (default value)
    - `BgTcMinWidth`: Minimum background/titlecard width filter—greater than or equal to: `3840` (default value)
    - `BgTcMinHeight`: Minimum background/titlecard height filter—greater than or equal to: `2160` (default value)
    - `tmdb_vote_sorting`: Picture sorting via TMDB api, either by `vote_average`, `vote_count` or by `primary` (Default value is: `vote_average`).
        - `primary` = default tmdb view (like on the website)
    - `PreferredLanguageOrder`: Specify language preferences. Default is `xx,en,de` (`xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
      - If you set it to `xx` you tell the script it should only search for textless, posters with text will be skipped.
    - `PreferredSeasonLanguageOrder`: Specify language preferences for seasons. Default is `xx,en,de` (`xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
    - `PreferredBackgroundLanguageOrder`: Specify language preferences for backgrounds. Default is `PleaseFillMe` ( It will take your poster lang order / `xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
      - If you set it to `xx` you tell the script it should only search for textless, posters with text will be skipped.
    </details>
    <details close>
    <summary>PlexPart [click to unfold]</summary>
    <br>

    - `LibstoExclude`: Libraries, by name, to exclude from processing.
    - `PlexUrl`: Plex server URL (i.e. "http://192.168.1.1:32400" or "http://myplexserver.com:32400").
    - `UsePlex`: If set to `true`, you tell the script to use a Plex Server (Default value is: `true`)
    - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Plex, but only if Plex does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.
    </details>
    <details close>
    <summary>JellyfinPart [click to unfold]</summary>
    <br>

    - `LibstoExclude`: Libraries, by local folder name, to exclude from processing.
    - `JellyfinUrl`: Jellyfin server URL (i.e. "http://192.168.1.1:8096" or "http://myplexserver.com:8096").
    - `UseJellyfin`: If set to `true`, you tell the script to use a Jellyfin Server (Default value is: `false`)
      - Also have a look at the hint: [Jellyfin CSS](#jellyfin-1)
    - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Jellyfin, but only if Jellyfin does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.
    - `ReplaceThumbwithBackdrop`: If set to `true` (Default value is: false), the script will replace the `Thumb` picture with the `backdrop` image. This will only occur if `BackgroundPosters` is also set to `true`.
    </details>
    <details close>
    <summary>EmbyPart [click to unfold]</summary>
    <br>

    - `LibstoExclude`: Libraries, by local folder name, to exclude from processing.
    - `EmbyUrl`: Emby server URL (i.e. "http://192.168.1.1:8096/emby" or "http://myplexserver.com:8096/emby").
    - `UseEmby`: If set to `true`, you tell the script to use a Emby Server (Default value is: `false`)
    - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Emby, but only if Emby does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.
    - `ReplaceThumbwithBackdrop`: If set to `true` (Default value is: false), the script will replace the `Thumb` picture with the `backdrop` image. This will only occur if `BackgroundPosters` is also set to `true`.
    </details>
    <details close>
    <summary>Notification [click to unfold]</summary>
    <br>

    - `SendNotification`: Set to `true` if you want to send notifications via discord or apprise, else `false`.
    - `AppriseUrl`: **Only possible on Docker** -Url for apprise provider -> [See Docs](https://github.com/caronc/apprise/wiki).
    - `Discord`: Discord Webhook Url.
    - `DiscordUserName`: Username for the discord webhook, default is `Posterizarr`
    - `UptimeKumaUrl`: Uptime-Kuma Webhook Url.
    - `UseUptimeKuma`: Set to `true` if you want to send webhook to Uptime-Kuma.
    </details>
    <details close>
    <summary>PrerequisitePart [click to unfold]</summary>
    <br>

    - `AssetPath`: Path to store generated posters.
    - `BackupPath`: Path to store/download Plex posters when using the [backup switch](#backup-mode).
    - `ManualAssetPath`: If assets are placed in this directory with the **exact** [naming convention](#manual-assets-naming), they will be preferred. (it has to follow the same naming convention as you have in `/assets`)
    - `SkipAddText`: If set to `true`, Posterizarr will skip adding text to the poster if it is flagged as a `Poster with text` by the provider.
    - `FollowSymlink`: If set to `true`, Posterizarr will follow symbolic links in the specified directories during hashtable creation, allowing it to process files and folders pointed to by the symlinks. This is useful if your assets are organized with symlinks instead of duplicating files.
    - `PlexUpload`: If set to `true`, Posterizarr will directly upload the artwork to Plex (handy if you do not use Kometa).
    - `ForceRunningDeletion`: If set to `true`, Posterizarr will automatically delete the Running File.
      - **Warning:** This may result in multiple concurrent runs sharing the same temporary directory, potentially causing image artifacts or unexpected behavior during processing.
    - `AutoUpdatePosterizarr`: If set to `true`, Posterizarr will update itself to latest version. (Only for non docker systems).
    - `show_skipped`: If set to `true`, verbose logging of already created assets will be displayed; otherwise, they will be silently skipped - On large libraries, this may appear as if the script is hanging.
    - `magickinstalllocation`: Path to ImageMagick installation location where `magick.exe` is located (Otherwise leave value as `"./magick"`)
      - The container handles this part on his own, you can leave it as it is in config.
    - `maxLogs`: Number of Log folders you want to keep in `RotatedLogs` Folder (Log History).
    - `logLevel`: Sets the verbosity of logging. 1 logs Warning/Error messages. Default is 2 which logs Info/Warning/Error messages. 3 captures Info/Warning/Error/Debug messages and is the most verbose.
    - `font`: Font file name.
    - `RTLfont`: RTL Font file name. (Right To Left - Currently only works under Windows, there is a bug on container)
    - `backgroundfont`: Background font file name.
    - `overlayfile`: Overlay file name.
    - `seasonoverlayfile`: Season overlay file name.
    - `backgroundoverlayfile`: Background overlay file name.
    - `titlecardoverlayfile` : Title Card overlay file name.
    - `poster4k`: 4K Poster overlay file name. (overlay has to match the Poster dimensions 2000x3000)
    - `Poster1080p` : 1080p Poster overlay file name. (overlay has to match the Poster dimensions 2000x3000)
    - `UsePosterResolutionOverlays`: Set to `true` to apply specific overlay with resolution for 4k/1080p posters [Example Pic](https://github.com/fscorrupt/Posterizarr/blob/main/images/poster-4k.png).
      - if you only want 4k just add your default overlay file also for `Poster1080p`.
    - `LibraryFolders`: Set to `false` for asset structure in one flat folder or `true` to split into library media folders like [Kometa](https://kometa.wiki/en/latest/kometa/guides/assets/#image-asset-directory-guide) needs it.
    - `Posters`: Set to `true` to create movie/show posters.
    - `NewLineOnSpecificSymbols`: Set to `true` to enable automatic insertion of a newline character at each occurrence of specific symbols in `NewLineSymbols` within the title text.
    - `NewLineSymbols`: A list of symbols that will trigger a newline insertion when `NewLineOnSpecificSymbols` is set to `true`. Separate each symbol with a comma (e.g., " - ", ":").
    - `SeasonPosters`: Set to `true` to also create season posters.
    - `BackgroundPosters`: Set to `true` to also create background posters.
    - `TitleCards` : Set to `true` to also create title cards.
    - `SkipTBA` : Set to `true` to skip TitleCard creation if the Titletext is `TBA`.
    - `SkipJapTitle` : Set to `true` to skip TitleCard creation if the Titletext is `Jap or Chinese`.
    - `AssetCleanup` : Set to `true` to cleanup Assets that are no longer in Plex.

        ```diff
        - !! IMPORTANT !! -

        Risk of Data Loss from excluded Libraries:

        When you exclude libraries, any assets within these locations may be inadvertently deleted.

        This happens because the script interprets these assets as "not needed anymore" during its execution since they are not found or listed as part of the active scan.

        Ensure that all active asset libraries are included when using that setting on true to prevent unintended deletions.
        ```
    - `AutoUpdateIM` : Set to `true` to AutoUpdate Imagemagick Portable Version (Does not work with Docker/Unraid).
      - Doing this could break things, cause you then uses IM Versions that are not tested with Posterizarr.
    </details>
    <details close>
    <summary>OverlayPart [click to unfold]</summary>
    <br>

    - `ImageProcessing`: Set to `true` if you want the ImageMagick part (text, overlay and/or border); if `false`, it only downloads the posters.
    - `outputQuality`: Image output quality, default is `92%` if you set it to `100%` the image size gets doubled.
    </details>
    <details close>
    <summary>PosterOverlayPart [click to unfold]</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the image.
    - `AddText`: Set to `true` to add text to the image.
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `AddOverlay`: Set to `true` to add the defined overlay file to the image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in poster.
    - `maxPointSize`: Maximum size of text in poster.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box.
    - `MaxHeight`: Maximum height of text box.
    - `text_offset`: Text box offset from the bottom of the picture.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <details close>
    <summary>SeasonPosterOverlayPart [click to unfold]</summary>
    <br>

    - `ShowFallback`: Set to `true` if you want to fallback to show poster if no season poster was found.
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the image.
    - `AddText`: Set to `true` to add text to the image.
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `AddOverlay`: Set to `true` to add the defined overlay file to the image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in poster.
    - `maxPointSize`: Maximum size of text in poster.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box.
    - `MaxHeight`: Maximum height of text box.
    - `text_offset`: Text box offset from the bottom of the picture.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <details close>
    <summary>ShowTilteOnSeasonPosterPart [click to unfold]</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddShowTitletoSeason`: if set to `true` it will add show title to season poster (Default Value is: `false`)
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in poster.
    - `maxPointSize`: Maximum size of text in poster.
    - `MaxWidth`: Maximum width of text box.
    - `MaxHeight`: Maximum height of text box.
    - `text_offset`: Text box offset from the bottom of the picture.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <details close>
    <summary>BackgroundOverlayPart [click to unfold]</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the background image.
    - `AddText`: Set to `true` to add text to the background image.
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `AddOverlay`: Set to `true` to add the defined background overlay file to the background image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in background image.
    - `maxPointSize`: Maximum size of text in background image.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box in background image.
    - `MaxHeight`: Maximum height of text box in background image.
    - `text_offset`: Text box offset from the bottom of the background image.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <details close>
    <summary>TitleCardOverlayPart [click to unfold]</summary>
    <br>

    - `UseBackgroundAsTitleCard`: Set to `true` if you prefer show background as TitleCard, default is `false` where it uses episode image as TitleCard.
    - `BackgroundFallback`: Set to `false` if you want to skip Background fallback for TitleCard images if no TitleCard was found.
    - `AddOverlay`: Set to `true` to add the defined TitleCard overlay file to the TitleCard image.
    - `AddBorder`: Set to `true` to add a border to the TitleCard image.
    - `borderwidth`: Border width.
    - `bordercolor`: Color of border.
    </details>
    <details close>
    <summary>TitleCardTitleTextPart [click to unfold]</summary>
    <br>

    - `AddEPTitleText`: Set to `true` to add episode title text to the TitleCard image.
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in TitleCard image.
    - `maxPointSize`: Maximum size of text in TitleCard image.
    - `MaxWidth`: Maximum width of text box in TitleCard image.
    - `MaxHeight`: Maximum height of text box in TitleCard image.
    - `text_offset`: Text box offset from the bottom of the TitleCard image.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <details close>
    <summary>TitleCardEpisodeTextPart [click to unfold]</summary>
    <br>

    - `SeasonTCText`: You can Specify the default text for `Season` that appears on TitleCard.
      - Example: `STAFFEL 1 • EPISODE 5` or `"SÄSONG 1 • EPISODE 1"`
    - `EpisodeTCText`: You can Specify the default text for `Episode` that appears on TitleCard.
      - Example: `SEASON 1 • EPISODE 5` or `"SEASON 1 • AVSNITT 1"`
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddEPText`: Set to `true` to add episode text to the TitleCard image.
    - `AddTextStroke`: Set to `true` to add stroke to text.
    - `strokecolor`: Color of text stroke.
    - `strokewidth`: Stroke width.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in TitleCard image.
    - `maxPointSize`: Maximum size of text in TitleCard image.
    - `MaxWidth`: Maximum width of text box in TitleCard image.
    - `MaxHeight`: Maximum height of text box in TitleCard image.
    - `text_offset`: Text box offset from the bottom of the TitleCard image.
    - `lineSpacing`: Adjust the height between lines of text (Default is `0`)
    - `TextGravity`: Specifies the text alignment within the textbox (Default is `south`)
    </details>
    <br>

3. Rename the config file to `config.json`.
4. Place the `overlay.png`, or whatever file you defined earlier in `overlayfile`, and `Rocky.ttf` font, or whatever font you defined earlier in `font` files in the same directory as Posterizarr.ps1 which is `$ScriptRoot`.

## Usage
- **Automatic Mode**: Execute the script without any parameters to generate posters for your entire Plex library.
- **Testing Mode**: Run the script with the `-Testing` switch to create Test posters before you start using it.
- **Manual Mode**: Run the script with the `-Manual` switch to create custom posters manually.
- **Backup Mode**: Run the script with the `-Backup` switch to download every artwork from plex (only those what are set to `true` in config)
- **Poster reset Mode**: Run the script with the `-PosterReset -LibraryToReset "Test Lib"` switch to reset every artwork from a specifc plex lib.

> [!NOTE]
>- Ensure PowerShell execution policy allows script execution.
>- Bugs or issues encountered during usage can be reported for resolution.

## Main Capabilities of Posterizarr

| **Feature**                      | **Description**                                                                                                                                                                                                                                                                                  |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Kometa Integration**           | -**Tip:** For users of Kometa (formerly PMM), Posterizarr organizes assets using the Kometa-compatible folder structure required for seamless integration: **[Assets Documentation](https://kometa.wiki/en/latest/kometa/guides/assets/)**.<br>- **Example Config**: See **[Kometa-Configs repo](https://github.com/Kometa-Team/Community-Configs/blob/master/fscorrupt/config.yml)** for sample configuration to streamline asset management.                                                                      |
| **Direct Upload to Media Servers** | - Posterizarr can directly upload artwork to media servers:<br> &nbsp; - **Plex**: Uploads artwork if Kometa isn’t used.<br> &nbsp; - **Jellyfin**: Directly uploads artwork.<br> &nbsp; - **Emby**: Similarly, uploads artwork directly.                    |
| **Upload Existing Assets**               | - Configure whether to **upload pre-existing assets** to Plex, Jellyfin, or Emby, saving time by skipping redundant uploads for libraries with complete artwork.                                                                     |
| **Backup Functionality**         | - Facilitates artwork **backup** by downloading all assets from **Plex** to a specified **backup share**.<br>- Supports the **Kometa folder structure** for organized storage.                                                                             |
| **Manual Asset Path (Local Assets)** | - **Local Asset Preference**: Prioritizes assets from a **manual asset path** if present. Skips download if local assets are available.<br>- **Path Configuration**: Specify the folder structure in the configuration, saving time and bandwidth by using pre-existing images. |
| **Resizing**                     | - Automatically resizes all **poster images** to **2000x3000** for optimized media server use.                                                                                                                                                                                                  |
| **Preferred Language Selection**         | - Configure **language preferences** for media metadata, supporting multi-language ordering.<br> &nbsp; - **Season-specific language preferences** allow finer control over metadata for localized season information.                |
| **Poster and Background Minimum Size**   | - Set minimum dimensions for **posters** (2000x3000) and **backgrounds/title cards** (3840x2160), ensuring only high-quality images are used.                                                                                        |
| **Overlay Effects**              | - Applies optional **overlays** to downloaded images:<br> &nbsp; - **Borders**: Adds polished framing.<br> &nbsp; - **Text**: Customizable title text.<br> &nbsp; - **Gradient Overlay**: Stylish gradient effect (custom options via **[gradient pack](gradient_background_poster_overlays.zip)**).                  |
| **Automatic Library Search**     | - Autonomously scans **Plex**, **Jellyfin**, or **Emby** server for libraries, simplifying setup.                                                                                                                                                                                                |
| **Handling Multiple Versions**   | - Manages **multiple versions** of movies/shows (e.g., theatrical cuts, director’s cuts), ensuring complete coverage for all available versions.                                                                                                          |
| **CSV Export**                   | - Generates a **CSV file** with queried movie/show data:<br> &nbsp; - **Plex**: `$ScriptRoot\logs\PlexLibexport.csv`<br> &nbsp; - **Other Media Servers (Jellyfin/Emby)**: `$ScriptRoot\logs\OtherMediaServerLibExport.csv`                                     |
| **Logging Capabilities**         | - Creates logs for **troubleshooting** and **analysis**:<br> &nbsp; - General script log: `$ScriptRoot\logs\Scriptlog.log`<br> &nbsp; - ImageMagick commands log: `$ScriptRoot\logs\ImageMagickCommands.log`<br> &nbsp; - Choices log: `ImageChoices.csv`         |
| **Uptime-Kuma**                | - Sends notifications to Uptime Kuma to monitor script activity for success and failure.                                                                                                                  |
| **Notifications**                | - Sends notifications about script activity using **Apprise** or **Discord**.<br>- **Example Images**: View sample images **[here](#webhook)**.                                                                                                                  |
| **Cross-Platform Compatibility** | - Runs on **Linux**, **Docker**, and **Windows** (Plex, Jellyfin, and Emby compatible), ensuring versatile usage in various environments.                                                                                                                |
| **Poster/Background/TitleCard Creation** | - Searches for high-quality artwork from **Fanart**, **TMDb**, **TVDb**, **Plex** (fallback: **IMDb**).<br>- Resizes to:<br> &nbsp; - **3840x2160** for backgrounds and title cards.<br> &nbsp; - **2000x3000** for posters.                               |
| **Library Exclusions**                   | - Specify libraries to **exclude from processing** on Plex, Jellyfin, and Emby servers, helping to avoid unnecessary processing for selected content categories (e.g., YouTube, Audiobooks).                                         |
| **Skip Items in Libraries**      | - Exclude items from processing by adding the **"skip_posterizarr"** label/tag to any item, preventing downloads and uploads for those items.                                                                                                            |
| **Auto-Update Options**                  | - Supports **auto-update settings** for both Posterizarr and ImageMagick, keeping tools up to date with minimal manual intervention. (Not on Docker)                                                                                                 |
| **Asset Cleanup** | - Automatic asset cleanup removes Posterizarr-created assets when corresponding media is deleted from the media server, ensuring storage efficiency. |
| **RTL (Right-to-Left) Font Support**     | - Supports **right-to-left (RTL) fonts** for media titles, making it more accessible for non-Latin-based languages such as Arabic or Hebrew.                                                                                         |
| **New Line on Specific Symbols**         | - Automatically adds a **new line on specific symbols** (e.g., hyphen or colon) within text to enhance visual aesthetics on overlays.                                                                                                |
| **Fallback Options for Title Cards**     | - Uses **background images as title cards** if title-specific artwork is unavailable.                                                                                         |


### Automatic Mode

Run the script without any parameters:

```powershell
.\Posterizarr.ps1
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1
```

This will generate posters for your entire Plex library based on the configured settings.

The posters are all placed in `AssetPath\...`. This can then be mounted in Kometa to use as the assets folder.

### Assets Tip
> [!TIP]
> Have a look at the [docker-compose.yml](https://github.com/fscorrupt/Posterizarr/blob/520ce753541fe90ec43c9e12ca056f839f9f4434/docker-compose.example.yml#L17) there is an example of the `/assets` Volume, you either can mount the Kometa Assets dir to Posterizarr or vice versa, its up to you.
>
>Its important that you update the containerpath you specified in your docker-compose.yml in your config.json, in my example it is `/assets`.
>
> - [IMAGE ASSET DIRECTORY GUIDE](https://kometa.wiki/en/latest/kometa/guides/assets/#image-asset-directory-guide)
>
> Assuming you made the config like i did, Posterizarr will now create the Posters directly in Kometa´s Asset dir.
>
> If you use Kometa make sure to set this settings on each Library in Kometa Config:
```yaml
libraries:
  4K TV Shows:
    settings:
      asset_directory: /assets/4K TV Shows
      prioritize_assets: true
    operations:
      assets_for_all: true
```
### Manual Assets Naming
> [!IMPORTANT]
> Naming must follow this rule; otherwise, the asset will not be picked up.

If you have Library Folders set to `true`, it will look like this:
| **Asset**                      | **Naming**                                                                                                                                                                                                                                                                                  |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Poster**           | `poster.*`|
| **Season**           | `Season01.*`<br>`Season02.*`<br>`.....`|
| **Season Special**           | `Season00.*`|
| **TitleCard**           | `S01E01.*`<br>`S01E02.*`<br>`.....`|
| **Background**           | `background.*`|

```
├───Anime Shows
│   └───Solo Leveling (2024) [tvdb-389597]
│           poster.jpg
│           S01E01.jpg
│           Season01.jpg
│           background.jpg
```
If you have Library Folders set to `false`, it will look like this:
| **Asset**                      | **Naming**                                                                                                                                                                                                                                                                                  |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Poster**           | `Solo Leveling (2024) [tvdb-389597].*`|
| **Season**           | `Solo Leveling (2024) [tvdb-389597]_Season01.*`<br>`Solo Leveling (2024) [tvdb-389597]_Season02.*`<br>`.....`|
| **Season Special**           | `Solo Leveling (2024) [tvdb-389597]_Season00.*`|
| **TitleCard**           | `Solo Leveling (2024) [tvdb-389597]_S01E01.*`<br>`Solo Leveling (2024) [tvdb-389597]_S01E02.*`<br>`.....`|
| **Background**           | `Solo Leveling (2024) [tvdb-389597]_background.*`|

```
├───Anime Shows
│       Solo Leveling (2024) [tvdb-389597].jpg
│       Solo Leveling (2024) [tvdb-389597]_S01E01.jpg
│       Solo Leveling (2024) [tvdb-389597]_Season01.jpg
│       Solo Leveling (2024) [tvdb-389597]_background.jpg
```
## Modes

### Tautulli Mode Docker
> [!IMPORTANT]
> Tautulli and Posterizarr must run as a container in Docker

> [!Note]
> If Discord is configured it will send a Notification on each trigger.

In this mode we use Tautulli to trigger Posterizarr for an specific item in Plex, like a new show, movie or episode got added.

To use it we need to configure a script in Tautulli, please follow these instructions.
1. Make sure that you mount the `Posterizarr` directory to tautulli, cause the script needs the Path `/posterizarr`
    ```yml
    volumes:
      - "/opt/appdata/posterizarr:/posterizarr:rw"
    ```
1. Download the [trigger.py](trigger.py) from the GH and place it in the Tautulli Script dir -> [Tautulli-Wiki](https://github.com/Tautulli/Tautulli/wiki/Custom-Scripts)
    - You may have to set `chmod +x` to the file.
1. Open Tautulli and go to Settings -> `NOTIFICATION AGENTS`
1. Click on `Add a new notification agent` and select `Script`
1. Specify the script folder where you placed the script and select the script file.
    - You can specify a `Description` at the bottom like i did.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step1.png">
      </a>
    </p>
    </details>
1. Go to `Triggers`, scroll down and select `Recently Added`.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step2.png">
      </a>
    </p>
    </details>
1. Go to `Conditions`, you can now specify when the script should get called.
    - In my case i specified the **Media Type**: `episode, movie, show and season`
    - I also excluded the **Youtube** Lib cause the videos i have there - **do not** have an `tmdb,tvdb or fanart ID`.
      - This is an recommended setting, either exclude such libs or include only those libs where Posterizarr should create art for.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step3.png">
      </a>
    </p>
    </details>
1. Next go to Arguments -> Unfold `Recently Added` Menu and paste the following Argument, after that you can save it.
    - **Please do not change the Argument otherwise the script could fail.**
    ```sh
    <movie>RatingKey "{rating_key}" mediatype "{media_type}"</movie><show>RatingKey "{rating_key}" mediatype "{media_type}"</show><season>parentratingkey "{parent_rating_key}" mediatype "{media_type}"</season><episode>RatingKey "{rating_key}" parentratingkey "{parent_rating_key}" grandparentratingkey "{grandparent_rating_key}" mediatype "{media_type}"</episode>
    ```
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step4.png">
      </a>
    </p>
    </details>

### Tautulli Mode Windows
> [!Note]
> If Discord is configured it will send a Notification on each trigger.

In this mode we use Tautulli to trigger Posterizarr for an specific item in Plex, like a new show, movie or episode got added.

1. Open Tautulli and go to Settings -> `NOTIFICATION AGENTS`
1. Click on `Add a new notification agent` and select `Script`
1. Specify the script folder of Posterizarr and select the script file.
    - Set the script timeout to `0`, which is unlimited. (The default is `30`, which would kill the script before it finishes.)
    - You can specify a `Description` at the bottom like i did.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_windows_Step1.png">
      </a>
    </p>
    </details>
1. Go to `Triggers`, scroll down and select `Recently Added`.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step2.png">
      </a>
    </p>
    </details>
1. Go to `Conditions`, you can now specify when the script should get called.
    - In my case i specified the **Media Type**: `episode, movie, show and season`
    - I also excluded the **Youtube** Lib cause the videos i have there - **do not** have an `tmdb,tvdb or fanart ID`.
      - This is an recommended setting, either exclude such libs or include only those libs where Posterizarr should create art for.
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step3.png">
      </a>
    </p>
    </details>
1. Next go to Arguments -> Unfold `Recently Added` Menu and paste the following Argument, after that you can save it.
    - **Please do not change the Argument otherwise the script could fail.**
    ```sh
    <movie>RatingKey "{rating_key}" mediatype "{media_type}"</movie><show>RatingKey "{rating_key}" mediatype "{media_type}"</show><season>parentratingkey "{parent_rating_key}" mediatype "{media_type}"</season><episode>RatingKey "{rating_key}" parentratingkey "{parent_rating_key}" grandparentratingkey "{grandparent_rating_key}" mediatype "{media_type}"</episode>
    ```
    <details close>
    <summary>🖼️Example [click to unfold]</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step4.png">
      </a>
    </p>
    </details>

### Testing Mode

Run the script with the `-Testing` flag. In this mode, the script will create pink posters/backgrounds with short, medium, and long texts (also in CAPS), using the values specified in the `config.json` file.

These test images are placed in the script root under the `./test` folder.

> [!TIP]
>This is handy for testing your configuration before applying it en masse to the actual posters. You can see how and where the text would be applied, as well as the size of the textbox.

```powershell
.\Posterizarr.ps1 -Testing
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Testing
```

### Manual Mode

> [!IMPORTANT]
> Currently only movie/show/season poster creation integrated.
>
> Source picture gets edited by script and  is then moved to desired asset location.

Run the script with the `-Manual` switch:

```powershell
.\Posterizarr.ps1 -Manual
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual
```

Follow the prompts to enter the source picture path (Container needs Access to it), media folder name, and movie/show title to manually create a custom poster.

### Backup Mode

Run the script with the `-Backup` flag. In this mode, the script will download every artwork you have in plex, using the values specified in the `config.json` file.

> [!TIP]
>This is handy for creating a backup or if you want an second assetfolder with kometa/tcm EXIF data for jellyfin/emby.

```powershell
.\Posterizarr.ps1 -Backup
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Backup
```

### Poster reset Mode

Run the script with the `-PosterReset -LibraryToReset "Test Lib"` flag. In this mode, posterizarr will reset every artwork from a specifc plex lib.

```powershell
.\Posterizarr.ps1 -PosterReset -LibraryToReset "Test Lib"
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -PosterReset -LibraryToReset "Test Lib"
```
> [!TIP]
> Note: This operation **does not delete** any artwork. It simply sets each item's poster to the first available poster from Plex’s metadata. This action cannot be undone, so proceed with caution.


### Sync Modes
> [!IMPORTANT]
> The script requires that library names in Plex and Emby/Jellyfin match exactly for the sync to work. It calculates the hash of the artwork from both servers to determine if there are differences, and only syncs the artwork if the hashes do not match.
#### Jellyfin
Run the script with the `-SyncJelly` flag. In this mode, the script will sync every artwork you have in plex to jellyfin.

```powershell
.\Posterizarr.ps1 -SyncJelly
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -SyncJelly
```

#### Emby
Run the script with the `-SyncEmby` flag. In this mode, the script will sync every artwork you have in plex to emby.

```powershell
.\Posterizarr.ps1 -SyncEmby
```

On [docker](#docker) this way:
```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -SyncEmby
```

> [!TIP]
>This is handy if you want to run the sync after a kometa run, then you have kometa ovlerayed images in jelly/emby

## Platforms & Tools

### Docker
- [Docker-Compose Example File](docker-compose.example.yml)
  - Change `RUN_TIME` in yaml to your needs **- You need to use 24H Time Format**
    - The Script gets executed on the Times you specified
    - Before starting the scheduled run it checks if another Posterizarr process is running, if yes - the scheduled run will be skipped.
  - Change `volume` and `network` to fit your environment (Make sure you have the same network as your plex container when you use local IP of plex)
  - Change `TimeZone` to yours, otherwise it will get scheduled to a different time you may want it to.
  - You may also have to change `PUID/PGID`

  If you manually want to run the Script you can do it this way:

  **Automatic Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1
  ```
  **Testing Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Testing
  ```
  **Manual Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual
  ```
  **Backup Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Backup
  ```
  **SyncJelly Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -SyncJelly
  ```
  **SyncEmby Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -SyncEmby
  ```
  **Poster reset Mode:**
  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -PosterReset -LibraryToReset "Test Lib"
  ```
> [!TIP]
> If you did not used `pwsh` on docker exec you can do it this way.
>
> Inside your `Unraid` or `Bash` or `Sh` console:
> ```sh
> pwsh /app/Posterizarr.ps1
> pwsh /app/Posterizarr.ps1 -Manual
> pwsh /app/Posterizarr.ps1 -Testing
> pwsh /app/Posterizarr.ps1 -Backup
> pwsh /app/Posterizarr.ps1 -SyncEmby
> pwsh /app/Posterizarr.ps1 -SyncJelly
>pwsh /app/Posterizarr.ps1 -PosterReset -LibraryToReset "Test Lib"
> ```

### unRAID
> [!TIP]
> If you are an unRAID user, just use the Community app from [@nwithan8](https://github.com/nwithan8) it is listed in Store.
>  - Change `RUN_TIME` to your needs **- You need to use 24H Time Format**
>    - Example: `06:00` or `06:00,14:00`.....
>  - AssetPath in config needs to be `/assets` not the path you entered.


### How to create the Posterizarr.xlsm
<details close>
<summary>📝Posterizarr Excel Creation using Module1.bas [click to unfold]</summary>
<br>

1. **Open Excel**: First, open Microsoft Excel on your computer. You can do this by clicking on the Excel icon in your applications menu or by searching for "Excel" in your computer's search bar and selecting it from the results.

2. **Access the Visual Basic for Applications (VBA) Editor**:
   - While in Excel, press `Alt + F11` on your keyboard. This keyboard shortcut will open the VBA editor window.

3. **Import Module**:
   - In the VBA editor window, you'll see a menu bar at the top.
   - Right-click on any existing module or in the project explorer (usually located on the left-hand side).
   - From the dropdown menu, select `Import File...`.
   - A file explorer window will open. Navigate to the location where you saved the `Module1.bas` file.
   - Select the `Module1.bas` file and click `Open`.

4. **Run the Macro**:
   - Now, go back to the Excel window.
   - Look for the `View` tab at the top of the Excel window.
   - Click on the `View` tab.
   - Within the `Macros` group, you'll find a button labeled `Macros`. Click on it.
   - In the dropdown menu, select `View Macros`.
   - A Macros dialog box will appear, listing all available macros.
   - In the list, you should see the `PromptUser` macro.
   - Select `PromptUser` from the list.
   - Finally, click the `Run` button.

Following these steps will allow you to import the `Module1.bas` file containing the VBA code into Excel and then run the `PromptUser` macro.

</details>

### How to use the Posterizarr.xlsm
<details close>
<summary>🎥Posterizarr Excel [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="excel" height="100%" src="/images/posterizarr-xlsm.gif">
  </a>
</p>

</details>

### Jellyfin
In order to view the `16:9` episode posters without getting cropped to `3:2`, you need to set a css.
```css
#itemDetailPage .listItemImage-large{
    width:16vw;
    height:9vw;
}
```
<details close>
<summary>CSS Client side How-To [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="excel" height="100%" src="/images/jellyfin_css.png">
  </a>
</p>

</details>

<details close>
<summary>CSS Server wide How-To [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="excel" height="100%" src="/images/jellyfin-css-server.png">
  </a>
</p>

</details>
## Showcase

### Brief Overview of Key Settings
<details close>
<summary>🖼️Layout and Styling Definitions [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="layoutstyling" height="100%" src="/images/poster_description.png">
  </a>
</p>
</details>

### Images from Testing Mode

<details close>
<summary>🖼️Posters [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="testing" height="100%" src="/images/testing.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️Backgrounds [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="backgroundtesting" height="100%" src="/images/backgroundtesting.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️TitleCards [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="titlecardtesting" height="100%" src="/images/titlecardtesting.png">
  </a>
</p>
</details>

### Webhook

<details close>
<summary>🖼️Discord Webhook [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="webhook" height="100%" src="/images/webhookexample.png">
  </a>
</p>

</details>

### Example Pictures

<details close>
<summary>🖼️ImageChoices.csv [click to unfold]</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="imagecsv" height="100%" src="/images/imagecsv.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Assets after Posterizarr run [click to unfold]</summary>
<br>
<p>
  Font - Colus-Regular.ttf
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="outputnew" height="100%" src="/images/posterizarr-overview-new.jpg">
  </a>

  Font - Comfortaa-Medium.ttf
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="output" height="100%" src="/images/posterizarr-overview.jpg">
  </a>
</p>
</details>

> [!TIP]
> - It was made using this Posterizarr [config](MyPersonalConfig.json).

<details close>
<summary>🖼️Assets after Kometa run [click to unfold]</summary>
<br>
<p>
  Font - Colus-Regular.ttf
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="kometa-overview-new" height="100%" src="/images/kometa-overview-new.jpg">
  </a>

  Font - Comfortaa-Medium.ttf
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="kometa-overview" height="100%" src="/images/kometa-overview.png">
  </a>
</p>
</details>

> [!TIP]
> - It was made using this Kometa [config](https://github.com/Kometa-Team/Community-Configs/tree/master/fscorrupt).

## Search Order

<details close>
<summary>🔍Movie Poster & Background [click to unfold]</summary>
<br>
<p>

  If `TMDB` is your fav Provider

  - TMDB
  - FANART
  - TVDB
  - PLEX (Not for Textless only `xx`)
  - IMDB (Movies only/Not for Textless only `xx`)

  If `TVDB` is your fav Provider

  - TVDB
  - TMDB
  - FANART
  - PLEX (Not for Textless only `xx`)
  - IMDB (Movies only/Not for Textless only `xx`)

  If `FANART` is your fav Provider

  - FANART
  - TMDB
  - TVDB
  - PLEX (Not for Textless only `xx`)
  - IMDB (Movies only/Not for Textless only `xx`)
</p>
</details>

<details close>
<summary>🔍Show Poster & Background [click to unfold]</summary>
<br>
<p>

  If `TMDB` is your fav Provider

  - TMDB
  - FANART
  - TVDB
  - PLEX (Not for Textless only `xx`)

  If `FANART` is your fav Provider

  - FANART
  - TMDB
  - TVDB
  - PLEX (Not for Textless only `xx`)

  If `TVDB` is your fav Provider

  - TVDB
  - TMDB
  - FANART
  - PLEX (Not for Textless only `xx`)
</p>
</details>

<details close>
<summary>🔍Show Season Poster [click to unfold]</summary>
<br>
<p>

  If `TMDB` is your fav Provider

  - TMDB
  - FANART
  - TVDB
  - PLEX (Not for Textless only `xx`)

  If `FANART` is your fav Provider

  - FANART
  - TMDB
  - TVDB
  - PLEX (Not for Textless only `xx`)

  If `TVDB` is your fav Provider

  - TVDB
  - TMDB
  - FANART
  - PLEX (Not for Textless only `xx`)
</p>
</details>

<details close>
<summary>🔍Show TC with Background Poster [click to unfold]</summary>
<br>
<p>

  If `TMDB` is your fav Provider

  - TMDB
  - TVDB
  - FANART
  - PLEX (Not for Textless only `xx`)

  Else

  - TVDB
  - TMDB
  - FANART
  - PLEX (Not for Textless only `xx`)
</p>
</details>
<details close>
<summary>🔍Show TC Poster [click to unfold]</summary>
<br>
<p>

  If `TMDB` is your fav Provider

  - TMDB
  - TVDB
  - PLEX (Not for Textless only `xx`)

  Else

  - TVDB
  - TMDB
  - PLEX (Not for Textless only `xx`)
</p>
</details>

## Enjoy

Feel free to customize the script further to meet your specific preferences or automation requirements.

## PR Rules

> [!IMPORTANT]
> - Adjust on each PR the version number in script on Line 15 `$CurrentScriptVersion = "1.9.7"`
> - Adjust the version number in [Release.txt](Release.txt) to match the one in script.
>   - this is required because the script checks against this file if a newer version is available.
> - Do not include images on a PR.

![versioning](/images/versioning.jpg)
