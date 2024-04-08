# Posterizarr

This PowerShell script automates the process of generating images for your Plex media library. Leveraging information from your Plex library, such as movie or show titles, season and episode data, it fetches relevant artwork from Fanart.tv, TMDB, TVDB, Plex and IMDB. The script is able to focus on artwork with specific languages to grab. By default, textless artwork `xx` is retrieved and will fall back to `en` if textless is not found. This is a setting a user can decide on, either to focus on textless or on text posters. It also offers both automatic and manual modes for generating posters. The manual mode can accommodate custom creations that cannot be bulk retrieved.

> [!NOTE]
Posterizarr is cross-platform ready, meaning it can run on Linux, Docker (Alpine v3.17) and on Windows operating systems.
> 
> **Supported Poster Types:**
>- Movie/Show Posters
>- Movie/Show Backgrounds
>- Season Posters
>- TitleCards

> [!TIP]
> Here is an installation [walkthrough](walkthrough.md)


> [!WARNING]
>- The `temp` Folder gets cleared on every Script run, so do not put files into it.
>- **[Apprise](https://github.com/caronc/apprise/wiki)** integration only works in docker container, please use discord on other platforms **(discord also works on docker)**.
>- **Please start the script as Admin on first run, otherwise the script is not able to install the prerequisites.**


### **Key Features:**
>[!TIP]
> If you want to use the created assets with PMM make sure to check out the [Assets doc](https://metamanager.wiki/en/latest/pmm/guides/assets/)
>
> You can find an example config for the Assets on my [PMM-Configs repo](https://github.com/meisnate12/Plex-Meta-Manager-Configs/blob/master/fscorrupt/config.yml)
- **Resizing**: It automatically resizes every poster to 2000x3000.
- **Overlays**: If you choose to, downloaded images will automatically have borders, text, and a gradient overlay applied.
  - Here are some gradient overlays that you can use instead of the default one [gradient-zip](gradient_background_poster_overlays.zip)
- **Automatic Library Search**: The script autonomously searches for libraries within your Plex server, enhancing its usability.
- **Handling Multiple Versions**: It adeptly manages multiple versions of a movie/show, ensuring comprehensive coverage.
- **CSV Export**: Produces an impressive CSV file containing all queried movie/show information during the script's runtime in `$ScriptRoot\logs\PlexLibexport.csv`
- **Logging Capabilities**: Records valuable information to a file in `$ScriptRoot\logs\Scriptlog.log`, facilitating troubleshooting and analysis.
    
    - It also generates a log with the output of every imagemagick command `$ScriptRoot\logs\ImageMagickCommands.log`.
    - Additionally, an `ImageChoices.csv` file is generated to store all the selected download options and essential information.
    - Send notification via apprise or discord [Click here for Example pictures.](#webhook).
- **Cross-platform Compatibility**: Ensures seamless operation across Linux, Docker, and Windows Plex servers, enhancing versatility.
- **Poster/Background/TitleCard Creation**: It searches fanart/tmdb/tvdb/Plex for posters/backgrounds/titlecards and resizes the downloaded image to 3840x2160 (for titlecards and backgrounds) or 2000x3000 (for posters), fallback is grabbing artwork from imdb.

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
    - **Version 7.x is required** - The script handles downloading and using a portable version of ImageMagick for all platforms. **(You may need to run the Script as Admin on first run)**. If you prefer to reference your own installation or prefer to download and install it yourself, goto: [Download ImageMagick](https://imagemagick.org/script/download.php)
>- **Powershell Version:** 5.x or higher (Docker Image uses v7.4.1).

## Configuration:

1. Open `config.example.json` located in the script directory.
2. Update the following variables with your API keys and preferences:

    <details close>
    <summary>ApiPart:</summary>
    <br>

    - `tvdbapi`: Your TVDB Project API key.
    - `tmdbtoken`: Your TMDB API Read Access Token.
    - `FanartTvAPIKey`: Your Fanart personal API key.
    - `PlexToken`: Your Plex token (Leave empty if not applicable).
    - `FavProvider`: Set your preferred provider (default is `tmdb`).
        - possible values are:
            -    `tmdb`
            -    `fanart`
            -    `tvdb`      
            -    `plex`     
    - `PreferredLanguageOrder`: Specify language preferences. Default is `xx,en,de` (`xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
    - `PreferredSeasonLanguageOrder`: Specify language preferences for seasons. Default is `xx,en,de` (`xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
    </details>
    <details close>
    <summary>PlexPart:</summary>
    <br>

    - `LibstoExclude`: Libraries, by name, to exclude from processing.
    - `PlexUrl`: Plex server URL (i.e. "http://192.168.1.1:32400" or "http://myplexserver.com:32400").
    </details>
    <details close>
        <summary>Notification:</summary>
    <br>

    - `SendNotification`: Set to `true` if you want to send notifications via discord or apprise, else `false`.
    - `AppriseUrl`: **Only possible on Docker** -Url for apprise provider -> [See Docs](https://github.com/caronc/apprise/wiki).
    - `Discord`: Discord Webhook Url.
    </details>
    <details close>
    <summary>PrerequisitePart:</summary>
    <br>

    - `AssetPath`: Path to store generated posters.
    - `show_skipped`: If set to `true`, verbose logging of already created assets will be displayed; otherwise, they will be silently skipped - On large libraries, this may appear as if the script is hanging.
    - `magickinstalllocation`: Path to ImageMagick installation location where `magick.exe` is located (Otherwise leave value as `"./magick"`)
      - The container handles this part on his own, you can leave it as it is in config.
    - `maxLogs`: Number of Log folders you want to keep in `RotatedLogs` Folder (Log History).
    - `logLevel`: Sets the verbosity of logging. 1 logs Warning/Error messages. Default is 2 which logs Info/Warning/Error messages. 3 captures Info/Warning/Error/Debug messages and is the most verbose.
    - `font`: Font file name.
    - `backgroundfont`: Background font file name.
    - `overlayfile`: Overlay file name.
    - `backgroundoverlayfile`: Background overlay file name.
    - `titlecardoverlayfile` : Title Card overlay file name.
    - `LibraryFolders`: Set to `false` for asset structure in one flat folder or `true` to split into library media folders like [Plex-Meta-Manager](https://metamanager.wiki/en/latest/pmm/guides/assets/#image-asset-directory-guide) needs it.
    - `Posters`: Set to `true` to create movie/show posters.
    - `SeasonPosters`: Set to `true` to also create season posters.
    - `BackgroundPosters`: Set to `true` to also create background posters.
    - `TitleCards` : Set to `true` to also create title cards.
    </details>
    <details close>
    <summary>OverlayPart:</summary>
    <br>

    - `ImageProcessing`: Set to `true` if you want the ImageMagick part; if false, it only downloads the posters.
    - `outputQuality`: Image output quality, default is `92%` if you set it to `100%` the image size gets doubled.
    </details>
    <details close>
    <summary>PosterOverlayPart:</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the image.
    - `AddText`: Set to `true` to add text to the image.
    - `AddOverlay`: Set to `true` to add the defined overlay file to the image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in poster.
    - `maxPointSize`: Maximum size of text in poster.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box.
    - `MaxHeight`: Maximum height of text box.
    - `text_offset`: Text box offset from the bottom of the picture.
    </details>
    <details close>
    <summary>SeasonPosterOverlayPart:</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the image.
    - `AddText`: Set to `true` to add text to the image.
    - `AddOverlay`: Set to `true` to add the defined overlay file to the image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in poster.
    - `maxPointSize`: Maximum size of text in poster.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box.
    - `MaxHeight`: Maximum height of text box.
    - `text_offset`: Text box offset from the bottom of the picture.
    </details>
    <details close>
    <summary>BackgroundOverlayPart:</summary>
    <br>

    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddBorder`: Set to `true` to add a border to the background image.
    - `AddText`: Set to `true` to add text to the background image.
    - `AddOverlay`: Set to `true` to add the defined background overlay file to the background image.
    - `fontcolor`: Color of font text.
    - `bordercolor`: Color of border.
    - `minPointSize`: Minimum size of text in background image.
    - `maxPointSize`: Maximum size of text in background image.
    - `borderwidth`: Border width.
    - `MaxWidth`: Maximum width of text box in background image.
    - `MaxHeight`: Maximum height of text box in background image.
    - `text_offset`: Text box offset from the bottom of the background image.
    </details>
    <details close>
    <summary>TitleCardOverlayPart:</summary>
    <br>

    - `UseBackgroundAsTitleCard`: Set to `true` if you prefer show background as TitleCard, default is `false` where it uses episode image as TitleCard.
    - `AddOverlay`: Set to `true` to add the defined TitleCard overlay file to the TitleCard image.
    - `AddBorder`: Set to `true` to add a border to the TitleCard image.
    - `borderwidth`: Border width.
    - `bordercolor`: Color of border.
    </details>
    <details close>
    <summary>TitleCardTitleTextPart:</summary>
    <br>

    - `AddEPTitleText`: Set to `true` to add episode title text to the TitleCard image.
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in TitleCard image.
    - `maxPointSize`: Maximum size of text in TitleCard image.
    - `MaxWidth`: Maximum width of text box in TitleCard image.
    - `MaxHeight`: Maximum height of text box in TitleCard image.
    - `text_offset`: Text box offset from the bottom of the TitleCard image.
    </details>
    <details close>
    <summary>TitleCardEpisodeTextPart:</summary>
    <br>

    - `SeasonTCText`: You can Specify the default text for `Season` that appears on TitleCard.
      - Example: `STAFFEL 1 • EPISODE 5` or `"SÄSONG 1 • EPISODE 1"`
    - `EpisodeTCText`: You can Specify the default text for `Episode` that appears on TitleCard.
      - Example: `SEASON 1 • EPISODE 5` or `"SEASON 1 • AVSNITT 1"`
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `AddEPText`: Set to `true` to add episode text to the TitleCard image.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in TitleCard image.
    - `maxPointSize`: Maximum size of text in TitleCard image.
    - `MaxWidth`: Maximum width of text box in TitleCard image.
    - `MaxHeight`: Maximum height of text box in TitleCard image.
    - `text_offset`: Text box offset from the bottom of the TitleCard image.
    </details>
    <br>

3. Rename the config file to `config.json`.
4. Place the `overlay.png`, or whatever file you defined earlier in `overlayfile`, and `Rocky.ttf` font, or whatever font you defined earlier in `font` files in the same directory as Posterizarr.ps1 which is `$ScriptRoot`.

**Usage:**
- **Automatic Mode**: Execute the script without any parameters to generate posters for your entire Plex library.
- **Testing Mode**: Run the script with the `-Testing` switch to create Test posters before you start using it.
- **Manual Mode**: Run the script with the `-Manual` switch to create custom posters manually.

> [!NOTE]
>- Ensure PowerShell execution policy allows script execution.
>- Bugs or issues encountered during usage can be reported for resolution.


### Automatic Mode

Run the script without any parameters:

```powershell
.\Posterizarr.ps1
```

This will generate posters for your entire Plex library based on the configured settings.

The posters are all placed in `AssetPath\...`. This can then be mounted in Plex-Meta-Manager to use as the assets folder.

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
1. Open Tautulli and go to Settings -> `NOTIFICATION AGENTS`
1. Click on `Add a new notification agent` and select `Script`
1. Specify the script folder where you placed the script and select the script file.
    - You can specify a `Description` at the bottom like i did.
    <details close>
    <summary>🖼️Example</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step1.png">
      </a>
    </p>
    </details>
1. Go to `Triggers`, scroll down and select `Recently Added`.
    <details close>
    <summary>🖼️Example</summary>
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
    <summary>🖼️Example</summary>
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
    <movie>RatingKey "{rating_key}" mediatype "{media_type}"</movie><show>grandparentratingkey "{grandparent_rating_key}" mediatype "{media_type}"</show><season>parentratingkey "{parent_rating_key}" grandparentratingkey "{grandparent_rating_key}" mediatype "{media_type}"</season><episode>RatingKey "{rating_key}" parentratingkey "{parent_rating_key}" grandparentratingkey "{grandparent_rating_key}" mediatype "{media_type}"</episode>
    ```
    <details close>
    <summary>🖼️Example</summary>
    <br>
    <p>
      <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
        <img alt="testing" height="100%" src="/images/Tautulli_Step4.png">
      </a>
    </p>
    </details>

### Testing Mode

Run the script with the `-Testing` flag. In this mode, the script will create pink posters/backgrounds with short, medium, and long texts (also in CAPS), using the values specified in the `config.json` file. 

> [!TIP]
>This is handy for testing your configuration before applying it en masse to the actual posters. You can see how and where the text would be applied, as well as the size of the textbox.

```powershell
.\Posterizarr.ps1 -Testing
```

### Docker
- [Docker-Compose Example File](docker-compose.yml)
  - Change `RUN_TIME` in yaml to your needs **- You need to use 24H Time Format**
    - The Script gets executed on the Times you specified
    - Before starting the scheduled run it checks if another Posterizarr process is running, if yes - the scheduled run will be skipped.
  - Change `volume` and `network` to fit your environment (Make sure you have the same network as your plex container when you use local IP of plex)
  - Change `TimeZone` to yours, otherwise it will get scheduled to a different time you may want it to.
  - You may also have to change `PUID/PGID`

> [!TIP]
> If you are an unRAID user, install the `Docker Compose Manager` plugin from the Community Apps store so that you can leverage the compose file
> 
  If you manually want to run the Script you can do it this way:

  **Automatic Mode:**
  ```sh
  docker exec -it posterizarr pwsh Posterizarr.ps1
  ```
  **Testing Mode:**
  ```sh
  docker exec -it posterizarr pwsh Posterizarr.ps1 -Testing
  ```
### Images from Testing Mode


<details close>
<summary>🖼️Posters</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="testing" height="100%" src="/images/testing.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️Backgrounds</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="backgroundtesting" height="100%" src="/images/backgroundtesting.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️TitleCards</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="titlecardtesting" height="100%" src="/images/titlecardtesting.png">
  </a>
</p>
</details>


### Manual Mode

> [!IMPORTANT]
> Alpha and only tested on Windows.
> 
> Currently only movie/show/season poster creation integrated

Run the script with the `-Manual` switch:

```powershell
.\Posterizarr.ps1 -Manual
```
Follow the prompts to enter the source picture path, media folder name, and movie/show title to manually create a custom poster.

### How to create the Posterizarr.xlsm
<details close>
<summary>📝Posterizarr Excel Creation using Module1.bas:</summary>
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
<summary>🎥Posterizarr Excel:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="excel" height="100%" src="/images/Posterizarr-xlsm.gif">
  </a>
</p>

</details>

### Webhook

<details close>
<summary>🖼️Discord Webhook:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="webhook" height="100%" src="/images/webhookexample.png">
  </a>
</p>

</details>

### Example Pictures:

<details close>
<summary>🖼️Script folder:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="folder" height="100%" src="/images/folder.png">
  </a>
</p>

</details>

<details close>
<summary>🖼️script output:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="output" height="100%" src="/images/output.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️ImageChoices.csv:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="imagecsv" height="100%" src="/images/imagecsv.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Assets after Posterizarr run:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="output" height="100%" src="/images/Posterizarr-overview.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Assets after PMM run:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Posterizarr" width="100%">
    <img alt="imagecsv" height="100%" src="/images/pmm-overview.png">
  </a>
</p>
</details>

### Enjoy

Feel free to customize the script further to meet your specific preferences or automation requirements.

### PR Rules

> [!IMPORTANT]
> - Adjust on each PR the version number in script on Line 11 `$CurrentScriptVersion = "1.0.55"`
> - Adjust the version number in [Release.txt](Release.txt) to match the one in script.
>   - this is required because the script checks against this file if a newer version is available.
> - Do not include images on a PR.

![versioning](/images/versioning.jpg)
