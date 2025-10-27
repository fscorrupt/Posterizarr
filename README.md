<a name="readme-top"></a>

<br />
<div align="center">
  <a href="https://github.com/fscorrupt/Posterizarr">
    <img src="/images/logo_banner.png" alt="Logo" width="550" height="550">
  </a>

  <p align="center">
    <a href="https://ko-fi.com/R6R81S6SC">Donate</a>
    ·
    <a href="https://github.com/fscorrupt/Posterizarr/issues">Report Bug</a>
    ·
    <a href="https://github.com/fscorrupt/Posterizarr/issues">Request Feature</a>
    ·
    <a href="https://discord.gg/fYyJQSGt54">Discord</a>

  </p>
</div>
<p align="center">
    <a href="https://ko-fi.com/R6R81S6SC" target="_blank"><img src="https://storage.ko-fi.com/cdn/brandasset/logo_white_stroke_small.png" alt="Buy Me A Coffee" height="25"></a>
    <a href="https://discord.gg/fYyJQSGt54" target="_blank"><img src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" alt="Discord" height="25"></a>
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

This PowerShell script automates generating images for your Plex, Jellyfin, or Emby library by using media info like titles, seasons, and episodes. It fetches artwork from Fanart.tv, TMDB, TVDB, Plex, and IMDb, focusing on specific languages - **defaulting to textless** images and falling back to English if unavailable. Users can choose between textless or text posters. The script supports both automatic bulk downloads and manual mode (interactive) for custom artwork that can’t be retrieved automatically.

## Introducing the Posterizarr Web UI 🌐

Exciting news! Posterizarr now features a user-friendly web interface to make configuration and management easier than ever.

From the UI, you can:

- Adjust all your settings directly in the browser
- Monitor real-time script activity
- View your created assets
- Set and manage script schedules
- Trigger runs with the click of a button
- ...and much more!

By default (Docker Only), the UI is accessible at `http://localhost:8000`.

The web UI comes pre-integrated in the Docker container. For other platforms like Windows or Linux, please see the [Manual Installation how-to](#ui-installation-manual).

<p align="center">
  <a href="https://github.com/fscorrupt/Posterizarr">
    <img alt="Web UI Preview" width="100%" src="/images/PosterizarrUI.png">
  </a>
</p>

> [!NOTE]
> Posterizarr is cross-platform ready, meaning it can run on Linux, [Docker (Alpine Base Image)](#docker), [unRAID](#unraid) and on Windows operating systems.
>
> **Supported Poster Types:**
>
> - Movie/Show Posters
> - Movie/Show Backgrounds
> - Season Posters
> - TitleCards
> - Collections are **NOT** supported (but you can create them through manual mode)

## Quick Start

1. **Installation**

   - Docker: `docker-compose up -d` (using provided docker-compose.yml)
   - Manual: Clone repo and follow [Manual Installation guide](walkthrough.md)

2. **Required API Keys**

   - Get TMDB API Token from [TMDB](https://www.themoviedb.org/settings/api)
   - Get Fanart API Key from [Fanart.tv](https://fanart.tv/get-an-api-key)
   - Get TVDB API Key from [TVDB](https://thetvdb.com/api-information/signup)
   - Review the [What You Need](#-what-you-need) section for required software/plugins

3. **Basic Configuration**

   - Copy `config.example.json` to `config.json` -> [Configuration](#configuration)
   - Add your API keys
   - Set your media server details (Plex/Jellyfin/Emby)
   - Configure asset paths

4. **First Run**

   ```bash
   # Docker
   docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Testing

   # Windows (as Admin) & Linux
   ./Posterizarr.ps1 -Testing
   ```

5. **Access Web UI**
   - Open `http://localhost:8000` in your browser
   - Default credentials: none required

For detailed setup instructions, see the [full walkthrough](walkthrough.md).

## 📏 Image Size Requirements
When uploading custom images through the Web UI or Manual mode, Posterizarr recommends the following dimensions for optimal quality:

- **Posters** (Movies/Shows/Seasons): **1000×1500px** (base) or **2000×3000px** or higher (**2:3 ratio**)
- **Backgrounds**: **1920×1080px** (base) or **3840×2160px** or higher (**16:9 ratio / 4K**)
- **Title Cards**: **1920×1080px** (base) or **3840×2160px** or higher (**16:9 ratio / 4K**)

The Web UI will display warnings if uploaded images are smaller than these recommended sizes, but will still process them.

## 🧰 What You Need

> [!IMPORTANT]
> **Requirements:**
>
> Before you begin, make sure you have:

> - **A media server (Plex, Jellyfin, or Emby)**
> - **TMDB API Read Access Token**
>   - [Obtain TMDB API Token](https://www.themoviedb.org/settings/api) -> **NOTE** the **TMDB API Read Access Token** is the really, really long one
> - **Fanart Personal API Key**
>   - [Obtain Fanart API Key](https://fanart.tv/get-an-api-key)
> - **TVDB API Key**
>   - [Obtain TVDB API Key](https://thetvdb.com/api-information/signup) -> **Do not** use `"Legacy API Key"`, it only works with a Project Api Key.
> - **ImageMagick (already integrated in container)**
>   - **Version 7.x is required** - The script handles downloading and using a portable version of ImageMagick for all platforms. **(You may need to run the Script as Admin on first run)**. If you prefer to reference your own installation or prefer to download and install it yourself, goto: [Download ImageMagick](https://imagemagick.org/script/download.php)
> - **Powershell Version (already integrated in container)**
>   - 7.x or higher.
> - **FanartTv Powershell Module (already integrated in container)**
>   - This module is required, goto: [Install Module](https://github.com/Celerium/FanartTV-PowerShellWrapper)

## Walkthrough - How-To

> [!TIP]
> Here is an installation [walkthrough](walkthrough.md)

## Tips

> [!IMPORTANT]
> Do not enable more then one media server.

> [!WARNING]
>
> - The `temp` Folder gets cleared on every Script run, so do not put files into it.
> - **[Apprise](https://github.com/caronc/apprise/wiki)** integration only works in docker container, please use discord on other platforms **(discord also works on docker)**.
> - Windows Users: **Please start the script as Admin on first run, otherwise the script is not able to install the prerequisites.**

> [!NOTE]
> At first run, the script takes time compiling data. Later runs only create posters missing from the AssetPath, skipping existing ones. To replace unwanted artwork, delete it from AssetPath and rerun the script to restore missing images.

# Configuration

1. Open `config.example.json` located in the script directory.
2. Update the following variables with your API keys and preferences [my personal config](MyPersonalConfig.json):

#### WebUI

- `basicAuthEnabled`: When set to `true`, the UI requires a username and password for access. (Default: `false`)
- `basicAuthUsername`: The username for UI authentication. (Default: `admin`)
- `basicAuthPassword`: The password for UI authentication. (Default: `posterizarr`)

#### ApiPart

   - `tvdbapi`: Your TVDB Project API key.
     - If you are a TVDB subscriber, you can append your PIN to the end of your API key in the format `YourApiKey#YourPin`. (It is important to include a `#` between the API key and the PIN.)
   - `tmdbtoken`: Your TMDB API Read Access Token.
   - `FanartTvAPIKey`: Your Fanart personal API key.
   - `PlexToken`: Your Plex token (Leave empty if not applicable).
   - `JellyfinAPIKey`: Your Jellyfin API key. (You can create an API key from inside Jellyfin at Settings > Advanced > Api Keys.)
   - `EmbyAPIKey`: Your Emby API key. (You can create an API key from inside Emby at Settings > Advanced > Api Keys.)
   - `FavProvider`: Set your preferred provider (default is `tmdb`).

     - possible values are:

       - `tmdb` (recommended)
       - `fanart`
       - `tvdb`
       - `plex` (Not recommended)
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

#### PlexPart

   - `LibstoExclude`: Libraries, by name, to exclude from processing.
   - `PlexUrl`: Plex server URL (i.e. "http://192.168.1.1:32400" or "http://myplexserver.com:32400").
   - `UsePlex`: If set to `true`, you tell the script to use a Plex Server (Default value is: `true`)
   - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Plex, but only if Plex does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.


#### JellyfinPart

   - `LibstoExclude`: Libraries, by local folder name, to exclude from processing.
   - `JellyfinUrl`: Jellyfin server URL (i.e. "http://192.168.1.1:8096" or "http://myplexserver.com:8096").
   - `UseJellyfin`: If set to `true`, you tell the script to use a Jellyfin Server (Default value is: `false`)
     - Also have a look at the hint: [Jellyfin CSS](#jellyfin-1)
   - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Jellyfin, but only if Jellyfin does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.
   - `ReplaceThumbwithBackdrop`: If set to `true` (Default value is: false), the script will replace the `Thumb` picture with the `backdrop` image. This will only occur if `BackgroundPosters` is also set to `true`.

#### EmbyPart

   - `LibstoExclude`: Libraries, by local folder name, to exclude from processing.
   - `EmbyUrl`: Emby server URL (i.e. "http://192.168.1.1:8096/emby" or "http://myplexserver.com:8096/emby").
   - `UseEmby`: If set to `true`, you tell the script to use a Emby Server (Default value is: `false`)
   - `UploadExistingAssets`: If set to `true`, the script will check local assets and upload them to Emby, but only if Emby does not already have EXIF data from Posterizarr, Kometa, or TCM for the artwork being uploaded.
   - `ReplaceThumbwithBackdrop`: If set to `true` (Default value is: false), the script will replace the `Thumb` picture with the `backdrop` image. This will only occur if `BackgroundPosters` is also set to `true`.

#### Notification

   - `SendNotification`: Set to `true` if you want to send notifications via discord or apprise, else `false`.
   - `AppriseUrl`: **Only possible on Docker** -Url for apprise provider -> [See Docs](https://github.com/caronc/apprise/wiki).
   - `Discord`: Discord Webhook Url.
   - `DiscordUserName`: Username for the discord webhook, default is `Posterizarr`
   - `UptimeKumaUrl`: Uptime-Kuma Webhook Url.
   - `UseUptimeKuma`: Set to `true` if you want to send webhook to Uptime-Kuma.

#### PrerequisitePart

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
   - `magickinstalllocation`: The path to the ImageMagick installation where `magick.exe` is located. (If you prefer using a portable version, leave the value as `"./magick"`.)
     - The container manages this automatically, so you can leave the default value in the configuration.
   - `maxLogs`: Number of Log folders you want to keep in `RotatedLogs` Folder (Log History).
   - `logLevel`: Sets the verbosity of logging. 1 logs Warning/Error messages. Default is 2 which logs Info/Warning/Error messages. 3 captures Info/Warning/Error/Debug messages and is the most verbose.
   - `font`: Font file name.
   - `RTLfont`: RTL Font file name.
   - `backgroundfont`: Background font file name.
   - `overlayfile`: Overlay file name.
   - `seasonoverlayfile`: Season overlay file name.
   - `backgroundoverlayfile`: Background overlay file name.
   - `titlecardoverlayfile` : Title Card overlay file name.
   - `poster4k`: 4K Poster overlay file name. (overlay has to match the Poster dimensions 2000x3000)
   - `Poster1080p` : 1080p Poster overlay file name. (overlay has to match the Poster dimensions 2000x3000)
   - `Background4k`: 4K Background overlay file name. (overlay has to match the Background dimensions 3840x2160)
   - `Background1080p` : 1080p Background overlay file name. (overlay has to match the Background dimensions 3840x2160)
   - `TC4k`: 4K TitleCard overlay file name. (overlay has to match the Poster dimensions 3840x2160)
   - `TC1080p` : 1080p TitleCard overlay file name. (overlay has to match the Poster dimensions 3840x2160)
   - `UsePosterResolutionOverlays`: Set to `true` to apply specific overlay with resolution for 4k/1080p posters [4K Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/poster-4k.png)/[1080p Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/poster-1080p.png).
     - if you only want 4k just add your default overlay file also for `Poster1080p`.
   - `UseBackgroundResolutionOverlays`: Set to `true` to apply specific overlay with resolution for 4k/1080p posters [4K Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/background-4k.png)/[1080p Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/background-1080p.png).
     - if you only want 4k just add your default overlay file also for `Background1080p`.
   - `UseTCResolutionOverlays`: Set to `true` to apply specific overlay with resolution for 4k/1080p posters [4K Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/background-4k.png)/[1080p Example](https://github.com/fscorrupt/Posterizarr/blob/main/images/background-1080p.png).
     - if you only want 4k - add your default (without an resolution) overlay file for `TC1080p`.
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
   - `DisableHashValidation` : Set to `true` to skip hash validation (Default value is: false).
     - _Note: This may produce bloat, as every item will be re-uploaded to the media servers._
   - `DisableOnlineAssetFetch` : Set to `true` to skip all online lookups and use only locally available assets. (Default value is: false).

#### OverlayPart

   - `ImageProcessing`: Set to `true` if you want the ImageMagick part (text, overlay and/or border); if `false`, it only downloads the posters.
   - `outputQuality`: Image output quality, default is `92%` if you set it to `100%` the image size gets doubled.

#### PosterOverlayPart

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

#### SeasonPosterOverlayPart

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

#### ShowTilteOnSeasonPosterPart

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

#### BackgroundOverlayPart

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

#### TitleCardOverlayPart

   - `UseBackgroundAsTitleCard`: Set to `true` if you prefer show background as TitleCard, default is `false` where it uses episode image as TitleCard.
   - `BackgroundFallback`: Set to `false` if you want to skip Background fallback for TitleCard images if no TitleCard was found.
   - `AddOverlay`: Set to `true` to add the defined TitleCard overlay file to the TitleCard image.
   - `AddBorder`: Set to `true` to add a border to the TitleCard image.
   - `borderwidth`: Border width.
   - `bordercolor`: Color of border.

#### TitleCardTitleTextPart

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

#### TitleCardEpisodeTextPart
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

#### CollectionPosterOverlayPart

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

#### CollectionTitlePosterPart

  - `fontAllCaps`: Set to `true` for all caps text, else `false`.
  - `AddCollectionTitle`: if set to `true` it will add collectiontitle to collection poster (Default Value is: `true`)
  - `CollectionTitle`: Extra text that gets added to the collection poster (Default is `Collection`)
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


3. Rename the config file to `config.json`.
4. Place the `overlay.png`, or whatever file you defined earlier in `overlayfile`, and `Rocky.ttf` font, or whatever font you defined earlier in `font` files in the same directory as Posterizarr.ps1 which is `$ScriptRoot`.

## Usage

- [**Automatic Mode**](#automatic-mode): Execute the script without any parameters to generate posters for your entire Plex library.
- [**Testing Mode**](#testing-mode): Run the script with the `-Testing` switch to create Test posters before you start using it.
- [**Manual Mode Interactive**](#manual-mode-interactive): Run the script with the `-Manual` switch to create custom posters manually (Interactive).
- [**Manual Mode Semi-Interactive**](#manual-mode-semi-automated): Run the script with the `-Manual` switch to create custom posters (You can pass everything via cli).
- [**Backup Mode**](#backup-mode): Run the script with the `-Backup` switch to download every artwork from plex (only those what are set to `true` in config)
- [**Poster reset Mode**](#poster-reset-mode): Run the script with the `-PosterReset -LibraryToReset "Test Lib"` switch to reset every artwork from a specifc plex lib.
- [**Sync Modes**](#sync-modes): Run the script with the `-SyncJelly or -SyncEmby` switch to sync every artwork you have in Plex to Jelly/Emby.

> [!NOTE]
>
> - Ensure PowerShell execution policy allows script execution.
> - Bugs or issues encountered during usage can be reported for resolution.

## Main Capabilities of Posterizarr

| **Feature**                              | **Description**                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kometa Integration**                   | -**Tip:** For users of Kometa (formerly PMM), Posterizarr organizes assets using the Kometa-compatible folder structure required for seamless integration: **[Assets Documentation](https://kometa.wiki/en/latest/kometa/guides/assets/)**.<br>- **Example Config**: See **[Kometa-Configs repo](https://github.com/Kometa-Team/Community-Configs/blob/master/fscorrupt/config.yml)** for sample configuration to streamline asset management. |
| **Direct Upload to Media Servers**       | - Posterizarr can directly upload artwork to media servers:<br> &nbsp; - **Plex**: Uploads artwork if Kometa isn’t used.<br> &nbsp; - **Jellyfin**: Directly uploads artwork.<br> &nbsp; - **Emby**: Similarly, uploads artwork directly.                                                                                                                                                                                                      |
| **Upload Existing Assets**               | - Configure whether to **upload pre-existing assets** to Plex, Jellyfin, or Emby, saving time by skipping redundant uploads for libraries with complete artwork.                                                                                                                                                                                                                                                                               |
| **Backup Functionality**                 | - Facilitates artwork **backup** by downloading all assets from **Plex** to a specified **backup share**.<br>- Supports the **Kometa folder structure** for organized storage.                                                                                                                                                                                                                                                                 |
| **Manual Asset Path (Local Assets)**     | - **Local Asset Preference**: Prioritizes assets from a **manual asset path** if present. Skips download if local assets are available.<br>- **Path Configuration**: Specify the folder structure in the configuration, saving time and bandwidth by using pre-existing images.                                                                                                                                                                |
| **Resizing**                             | - Automatically resizes all **poster images** to **2000x3000** for optimized media server use.                                                                                                                                                                                                                                                                                                                                                 |
| **Preferred Language Selection**         | - Configure **language preferences** for media metadata, supporting multi-language ordering.<br> &nbsp; - **Season-specific language preferences** allow finer control over metadata for localized season information.                                                                                                                                                                                                                         |
| **Poster and Background Minimum Size**   | - Set minimum dimensions for **posters** (2000x3000) and **backgrounds/title cards** (3840x2160), ensuring only high-quality images are used.                                                                                                                                                                                                                                                                                                  |
| **Overlay Effects**                      | - Applies optional **overlays** to downloaded images:<br> &nbsp; - **Borders**: Adds polished framing.<br> &nbsp; - **Text**: Customizable title text.<br> &nbsp; - **Gradient Overlay**: Stylish gradient effect (custom options via **[gradient pack](gradient_background_poster_overlays.zip)**).                                                                                                                                           |
| **Automatic Library Search**             | - Autonomously scans **Plex**, **Jellyfin**, or **Emby** server for libraries, simplifying setup.                                                                                                                                                                                                                                                                                                                                              |
| **Handling Multiple Versions**           | - Manages **multiple versions** of movies/shows (e.g., theatrical cuts, director’s cuts), ensuring complete coverage for all available versions.                                                                                                                                                                                                                                                                                               |
| **CSV Export**                           | - Generates a **CSV file** with queried movie/show data:<br> &nbsp; - **Plex**: `$ScriptRoot\logs\PlexLibexport.csv`<br> &nbsp; - **Other Media Servers (Jellyfin/Emby)**: `$ScriptRoot\logs\OtherMediaServerLibExport.csv`                                                                                                                                                                                                                    |
| **Logging Capabilities**                 | - Creates logs for **troubleshooting** and **analysis**:<br> &nbsp; - General script log: `$ScriptRoot\logs\Scriptlog.log`<br> &nbsp; - ImageMagick commands log: `$ScriptRoot\logs\ImageMagickCommands.log`<br> &nbsp; - Choices log: `ImageChoices.csv`                                                                                                                                                                                      |
| **Uptime-Kuma**                          | - Sends notifications to Uptime Kuma to monitor script activity for success and failure.                                                                                                                                                                                                                                                                                                                                                       |
| **Notifications**                        | - Sends notifications about script activity using **Apprise** or **Discord**.<br>- **Example Images**: View sample images **[here](#webhook)**.                                                                                                                                                                                                                                                                                                |
| **Cross-Platform Compatibility**         | - Runs on **Linux**, **Docker**, and **Windows** (Plex, Jellyfin, and Emby compatible), ensuring versatile usage in various environments.                                                                                                                                                                                                                                                                                                      |
| **Poster/Background/TitleCard Creation** | - Searches for high-quality artwork from **Fanart**, **TMDb**, **TVDb**, **Plex** (fallback: **IMDb**).<br>- Resizes to:<br> &nbsp; - **3840x2160** for backgrounds and title cards.<br> &nbsp; - **2000x3000** for posters.                                                                                                                                                                                                                   |
| **Library Exclusions**                   | - Specify libraries to **exclude from processing** on Plex, Jellyfin, and Emby servers, helping to avoid unnecessary processing for selected content categories (e.g., YouTube, Audiobooks).                                                                                                                                                                                                                                                   |
| **Skip Items in Libraries**              | - Exclude items from processing by adding the **"skip_posterizarr"** label/tag to any item, preventing downloads and uploads for those items.                                                                                                                                                                                                                                                                                                  |
| **Auto-Update Options**                  | - Supports **auto-update settings** for both Posterizarr and ImageMagick, keeping tools up to date with minimal manual intervention. (Not on Docker)                                                                                                                                                                                                                                                                                           |
| **Asset Cleanup**                        | - Automatic asset cleanup removes Posterizarr-created assets when corresponding media is deleted from the media server, ensuring storage efficiency.                                                                                                                                                                                                                                                                                           |
| **RTL (Right-to-Left) Font Support**     | - Supports **right-to-left (RTL) fonts** for media titles, making it more accessible for non-Latin-based languages such as Arabic or Hebrew.                                                                                                                                                                                                                                                                                                   |
| **New Line on Specific Symbols**         | - Automatically adds a **new line on specific symbols** (e.g., hyphen or colon) within text to enhance visual aesthetics on overlays.                                                                                                                                                                                                                                                                                                          |
| **Fallback Options for Title Cards**     | - Uses **background images as title cards** if title-specific artwork is unavailable.                                                                                                                                                                                                                                                                                                                                                          |
| **Overlay Reset**                        | - Reset all posters in a library of your choice to the Plex default.                                                                                                                                                                                                                                                                                                                                                                           |

## Modes

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

### Testing Mode

Run the script with the `-Testing` flag. In this mode, the script will create pink posters/backgrounds with short, medium, and long texts (also in CAPS), using the values specified in the `config.json` file.

These test images are placed in the script root under the `./test` folder.

> [!TIP]
> This is handy for testing your configuration before applying it en masse to the actual posters. You can see how and where the text would be applied, as well as the size of the textbox.

```powershell
.\Posterizarr.ps1 -Testing
```

On [docker](#docker) this way:

```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Testing
```

### Manual Mode (Interactive)

> [!IMPORTANT]
>
> Source picture gets edited by script and is then moved to desired asset location.

Run the script with the `-Manual` switch:

```powershell
.\Posterizarr.ps1 -Manual
```

On [docker](#docker) this way:

```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual
```

Follow the prompts to enter the source picture path (Container needs Access to it), media folder name, and movie/show title to manually create a custom poster.

**Posterizarr Input Prompts**

`Enter local path or URL to source picture:`

- Paste the image URL or provide the full local path to the image file you want to use as the poster source. This is the image that Posterizarr will base the new poster on.

`Enter Media Folder Name (as seen by Plex):`

- The name of the local movie or show folder where the .mkv (or other media) file is stored. This should match the folder structure Plex recognizes.

`Enter Movie/Show/Collection Title:`

- The title that will be displayed on the generated poster.

`Create Season Poster? (y/n):`

- Type `y` if you're generating a season poster, otherwise `n`.

`Create TitleCard? (y/n):`

- Type `y` if you also want to create a title card, otherwise `n`.

`Create Collection Poster? (y/n):`

- Type `y` if you're generating a collection poster, otherwise `n`.

`Enter Plex Library Name:`

- Enter the name of the Plex (or Jellyfin) library, e.g., "Movies" or "TV Shows".

### Manual Mode (Semi Automated)

> [!IMPORTANT]
>
> The source picture is moved (if local) or downloaded (if a URL - and moved), then edited and placed in the desired asset location.
> The -PicturePath parameter can accept either a local file path or a direct URL to an image.

```
Example on Windows:
  -PicturePath "C:\path\to\movie_bg.jpg"

Example on Docker:
  -PicturePath "/path/to/movie_bg.jpg"

Example with URL:
  -PicturePath "https://posterurl.here/movie_bg.jpg"
```

**Movie or Show Poster**

To create a standard poster for a movie or a TV show's main entry:

```powershell
.\Posterizarr.ps1 -Manual -PicturePath "C:\path\to\movie_bg.jpg" -Titletext "The Martian" -FolderName "The Martian (2015)" -LibraryName "Movies"
```

On [docker](#docker) this way:

```sh
docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual -PicturePath "/path/to/movie_bg.jpg" -Titletext "The Martian" -FolderName "The Martian (2015)" -LibraryName "Movies"
```

**Season Poster**

> [!NOTE]
>
> Any season name ending in 0 or 00 (e.g., "Season 0", "Staffel 00") or matching a keyword like "Specials" will be handled as a Specials season.

To create a poster for a specific season of a TV show, use the -SeasonPoster switch and provide the season name:

```powershell
.\Posterizarr.ps1 -Manual -SeasonPoster -PicturePath "C:\path\to\show_bg.jpg" -Titletext "The Mandalorian" -FolderName "The Mandalorian (2019)" -LibraryName "TV Shows" -SeasonPosterName "Season 1"
```

On [docker](#docker) this way:

```sh
docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual -SeasonPoster -PicturePath "/path/to/show_bg.jpg" -Titletext "The Mandalorian" -FolderName "The Mandalorian (2019)" -LibraryName "TV Shows" -SeasonPosterName "Season 1"
```

**Collection Poster**

To create a poster for a media collection, use the -CollectionCard switch. The script will use the -Titletext for both the poster text and the folder name.

```powershell
.\Posterizarr.ps1 -Manual -CollectionCard -PicturePath "C:\path\to\collection_bg.jpg" -Titletext "James Bond" -LibraryName "Movies"
```

On [docker](#docker) this way:

```sh
docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual -CollectionCard -PicturePath "/path/to/collection_bg.jpg" -Titletext "James Bond" -LibraryName "Movies"
```

**Background Poster**

To create a standard background poster for a movie or a TV show's main entry:

```powershell
.\Posterizarr.ps1 -Manual -BackgroundCard -PicturePath "C:\path\to\movie_bg.jpg" -Titletext "The Martian" -FolderName "The Martian (2015)" -LibraryName "Movies"
```

On [docker](#docker) this way:

```sh
docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual -BackgroundCard -PicturePath "/path/to/movie_bg.jpg" -Titletext "The Martian" -FolderName "The Martian (2015)" -LibraryName "Movies"
```

**Episode Title Card**

To create a 16:9 title card for a specific episode, use the -TitleCard switch and provide episode details:

```powershell
.\Posterizarr.ps1 -Manual -TitleCard -PicturePath "C:\path\to\episode_bg.jpg" -FolderName "Breaking Bad (2008)" -LibraryName "TV Shows" -EPTitleName "Ozymandias" -SeasonPosterName "Season 5" -EpisodeNumber "14"
```

On [docker](#docker) this way:

```sh
docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Manual -TitleCard -PicturePath "/path/to/episode_bg.jpg" -FolderName "Breaking Bad (2008)" -LibraryName "TV Shows" -EPTitleName "Ozymandias" -SeasonPosterName "Season 5" -EpisodeNumber "14"
```

### Backup Mode

Run the script with the `-Backup` flag. In this mode, the script will download every artwork you have in plex, using the values specified in the `config.json` file.

> [!TIP]
> This is handy for creating a backup or if you want an second assetfolder with kometa/tcm EXIF data for jellyfin/emby.

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
> This is handy if you want to run the sync after a kometa run, then you have kometa ovlerayed images in jelly/emby

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
   ⚠️ Note: This mount path is case-sensitive and must match exactly /posterizarr.
1. Download the [trigger.py](/modules/trigger.py) from the GH and place it in the Tautulli Script dir -> [Tautulli-Wiki](https://github.com/Tautulli/Tautulli/wiki/Custom-Scripts)
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

### Sonarr/Radarr Mode Docker

> [!IMPORTANT]
> Arrs and Posterizarr must run as a container in Docker

> [!Note]
> If Discord is configured it will send a Notification on each trigger.

In this mode we use Sonarr/Radarr to trigger Posterizarr for an specific item in Plex/Jellyfin, like a new show, movie or episode got added.

To use it we need to configure a script in Sonarr/Radarr, please follow these instructions.

1. Ensure you mount the `Posterizarr` directory to your Sonarr/Radarr container, as the script requires access to `/posterizarr`:
   ```yml
   volumes:
     - "/opt/appdata/posterizarr:/posterizarr:rw"
   ```
   ⚠️ Note: This mount path is case-sensitive and must match exactly `/posterizarr`.
2. Download [ArrTrigger.sh](/modules/ArrTrigger.sh) from GitHub and place it in your Sonarr/Radarr script directory.
   - For example, create a `scripts` folder in `/opt/appdata/sonarr`, resulting in the path:
     `/opt/appdata/sonarr/scripts/ArrTrigger.sh`
   - Make sure to set executable permissions: `chmod +x ArrTrigger.sh`
3. In Sonarr/Radarr, go to **Settings** → **Connect**.
4. Click the `+` button and select **Custom Script**.
5. Enter a name for the script.
6. For **Notification Triggers**, select only `On File Import`.
7. Under **Path**, browse to and select your `ArrTrigger.sh` script.
   - Example: `/config/scripts/ArrTrigger.sh`
8. With this setup, the Arr suite will create a file in `/posterizarr/watcher` whenever a file is imported.
   - The file will be named like: `recently_added_20250925114601966_1da214d7.posterizarr`
9. Posterizarr monitors this directory for files ending in `.posterizarr`.
   - When such a file is detected, it **waits** up to `5 minutes`(based on fileage), then reads the file and triggers a Posterizarr run for the corresponding item.

### UI Installation (Manual)

This guide is for users on **Windows** and **Linux** who are not using Docker and wish to run the web UI from the source.

**Prerequisites**

Before you begin, ensure you have the following software installed and accessible from your system's command line (PATH):

- ✅ **Python 3:** Required for the backend server.
- ✅ **Node.js (with npm):** Required for the frontend interface.
- ✅ **PowerShell Core:** Required to run the main `Posterizarr.ps1` script.

**Setup Instructions**

The setup process is handled by a simple script that installs all necessary dependencies.

1.  Open a terminal or command prompt.
2.  Navigate into the `webui` directory located in the project's root folder.
    ```bash
    cd path/to/Posterizarr/webui
    ```
3.  Run the appropriate setup script for your operating system:
    - **On Windows:**
      ```bash
      setup.ps1
      ```
      or
      ```bash
      setup.bat
      ```
    - **On Linux or macOS:**
      ```bash
      setup.sh
      ```
      The script will verify your prerequisites and install all required backend (Python) and frontend (Node.js) packages.

**Running the UI**

After the setup is complete, you need to start the backend and frontend processes in **two separate terminals**.

**Terminal 2: Start the Frontend**

```bash
# Navigate to the frontend directory
cd webui/frontend

# Run the development server
npm run build
```

**Terminal 1: Start the Backend**

```bash
# Navigate to the backend directory
cd webui/backend

# Run the Python server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Once both services are running, you can access the Posterizarr Web UI by opening your browser and navigating to: http://localhost:8000

### Assets Tip

> [!TIP]
> Have a look at the [docker-compose.yml](https://github.com/fscorrupt/Posterizarr/blob/aa1143e66830d9343189ea93f0d050b986b18abd/docker-compose.yml#L19) there is an example of the `/assets` Volume, you either can mount the Kometa Assets dir to Posterizarr or vice versa, its up to you.
>
> Its important that you update the containerpath you specified in your docker-compose.yml in your config.json, in my example it is `/assets`.
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
> Naming must follow these rules, including proper case sensitivity (uppercase and lowercase) in file/folder names; otherwise, the asset will not be picked up.

If you have Library Folders set to `true`, it will look like this:
| **Asset** | **Naming** |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Poster** | `poster.*`|
| **Season** | `Season01.*`<br>`Season02.*`<br>`.....`|
| **Season Special** | `Season00.*`|
| **TitleCard** | `S01E01.*`<br>`S01E02.*`<br>`.....`|
| **Background** | `background.*`|

```
├───Anime Shows
│   └───Solo Leveling (2024) [tvdb-389597]
│           poster.jpg
│           S01E01.jpg
│           Season01.jpg
│           background.jpg
```

If you have Library Folders set to `false`, it will look like this:
| **Asset** | **Naming** |
|----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Poster** | `Solo Leveling (2024) [tvdb-389597].*`|
| **Season** | `Solo Leveling (2024) [tvdb-389597]_Season01.*`<br>`Solo Leveling (2024) [tvdb-389597]_Season02.*`<br>`.....`|
| **Season Special** | `Solo Leveling (2024) [tvdb-389597]_Season00.*`|
| **TitleCard** | `Solo Leveling (2024) [tvdb-389597]_S01E01.*`<br>`Solo Leveling (2024) [tvdb-389597]_S01E02.*`<br>`.....`|
| **Background** | `Solo Leveling (2024) [tvdb-389597]_background.*`|

```
├───Anime Shows
│       Solo Leveling (2024) [tvdb-389597].jpg
│       Solo Leveling (2024) [tvdb-389597]_S01E01.jpg
│       Solo Leveling (2024) [tvdb-389597]_Season01.jpg
│       Solo Leveling (2024) [tvdb-389597]_background.jpg
```

## Platforms & Tools

### Docker

- [Docker-Compose Example File](docker-compose.yml)

  - Change `RUN_TIME` in yaml to your needs **- You need to use 24H Time Format**
    - The Script gets executed on the Times you specified
    - Before starting the scheduled run it checks if another Posterizarr process is running, if yes - the scheduled run will be skipped.
    - If set to `disabled`, the script will **not** run on a schedule but will still watch for file triggers and respond to manual triggers.
      - Required at `disabled` for the UI & if you want to set the schedules there.
  - Change `volume` and `network` to fit your environment (Make sure you have the same network as your plex container when you use local IP of plex)
  - Change `TimeZone` to yours, otherwise it will get scheduled to a different time you may want it to.
  - Add `DISABLE_UI` and set it to `true` if you want to disable the UI.
  - Change `APP_PORT` and set it to your prefered port (`9000` also update it in compose ports block)
  - You may also have to change `user: "1000:1000"` (PUID/PGID)

  If you manually want to run the Script you can do it this way:

  **Automatic Mode:**

  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1
  ```

  **Testing Mode:**

  ```sh
  docker exec -it posterizarr pwsh /app/Posterizarr.ps1 -Testing
  ```

  **Manual Mode (Interactive):**

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
  >
  > ```sh
  > pwsh /app/Posterizarr.ps1
  > pwsh /app/Posterizarr.ps1 -Manual
  > pwsh /app/Posterizarr.ps1 -Testing
  > pwsh /app/Posterizarr.ps1 -Backup
  > pwsh /app/Posterizarr.ps1 -SyncEmby
  > pwsh /app/Posterizarr.ps1 -SyncJelly
  > pwsh /app/Posterizarr.ps1 -PosterReset -LibraryToReset "Test Lib"
  > ```

### unRAID

> [!TIP]
> If you are an unRAID user, just use the Community app from [@nwithan8](https://github.com/nwithan8) it is listed in Store.
>
> - Change `RUN_TIME` to your needs **- You need to use 24H Time Format**
>   - Example: `06:00` or `06:00,14:00`.....
> - AssetPath in config needs to be `/assets` not the path you entered.

### Jellyfin

In order to view the `16:9` episode posters without getting cropped to `3:2`, you need to set a css.

```css
#itemDetailPage .listItemImage-large {
  width: 16vw;
  height: 9vw;
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
>
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
>
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
>
> - Adjust on each PR the version number in script on Line 54 `$CurrentScriptVersion = "2.0.0"`
> - Adjust the version number in [Release.txt](Release.txt) to match the one in script.
>   - this is required because the script checks against this file if a newer version is available.
> - Do not include images on a PR.

![versioning](/images/versioning.jpg)
