# Plex Poster Maker

This PowerShell script automates the process of generating images for your Plex media library. Leveraging information from your Plex library, such as movie or show titles | season and episode data, it fetches relevant artwork from Fanart.tv, TMDB, TVDB, and IMDB. The script is able to focus on specific language to grab; by default, it is `xx`, which means textless, and then fallbacks to `en` if not available. This is a setting a user can decide on, either to focus on textless or on text posters. It also offers both automatic and manual modes for generating posters, accommodating custom creations that cannot be automated.

```Plex Poster Maker is cross-platform ready, meaning it can run on both Linux and Windows operating systems.```

**Suported Poster Types:**
- Movie/Show Posters
- Movie/Show Backgrounds
- Season Posters
- TitleCards

### ! Important !
The `Temp` Folder gets cleared on every Script run, so do not put files into it.

**Please start the script as Admin on first run, otherwise the script is not able to install the prerequisites.**


**Key Features:**
- **Resizing**: It automatically resizes every poster to 2000x3000.
- **Overlays**: If you choose to, downloaded images will automatically have borders, text, and a gradient overlay applied.
- **Automatic Library Search**: The script autonomously searches for libraries within your Plex server, enhancing its usability.
- **Handling Multiple Versions**: It adeptly manages multiple versions of a movie/show, ensuring comprehensive coverage.
- **CSV Export**: Produces an impressive CSV file containing all queried movie/show information during the script's runtime in `$ScriptRoot\logs\PlexLibexport.csv`
- **Logging Capabilities**: Records valuable information to a file in `$ScriptRoot\logs\Scriptlog.log`, facilitating troubleshooting and analysis.
    
    - It also generates a log with the output of every imagemagick command `$ScriptRoot\logs\ImageMagickCommands.log`.
    - Additionally, an `ImageChoices.csv` file is generated to store all the selected download options and essential information.
- **Cross-platform Compatibility**: Ensures seamless operation across Linux, Docker, and Windows Plex servers, enhancing versatility.
- **Poster/Background/TitleCard Creation**: It searches fanart/tmdb/tvdb for textless posters/backgrounds/titlecards and resizes the downloaded image to 3840x2160, fallback is grabbing a poster from imdb.

Upon initial execution, the script may take some time to run as it compiles necessary data. Subsequent runs efficiently create missing posters, bypassing existing assets in the directory.

**Requirements:**
Before utilizing the script, ensure the following prerequisites are installed and configured:

- **TMDB API Read Access Token:** [Obtain TMDB API Token](https://www.themoviedb.org/settings/api)
- **Fanart Personal API Key:** [Obtain Fanart API Key](https://fanart.tv/get-an-api-key)
- **TVDB API Key:** [Obtain TVDB API Key](https://thetvdb.com/api-information/signup)
    - **Do not** use `"Legacy API Key"`, it only works with a Project Api Key.
- **ImageMagick:** [Download ImageMagick](https://imagemagick.org/script/download.php#windows)
    - Download and Install the Latest Imagemagick, installation is covered in Script **(You may need to run the Script as Admin on first run)**.
- **Powershell Version:** 5.x or higher, ps core 6.x/7.x also works.

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
    - `PreferedLanguageOrder`: Specify language preferences. Default is `xx,en,de` (`xx` is Textless). Example configurations can be found in the config file. 2-digit language codes can be found here: [ISO 3166-1 Lang Codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2).
    </details>
    <details close>
    <summary>PlexPart:</summary>
    <br>

    - `LibstoExclude`: Libraries, by name, to exclude from processing.
    - `PlexUrl`: Plex server URL (i.e. "http://192.168.1.1:32400" or "http://myplexserver.com:32400").
    </details>
    <details close>
    <summary>PrerequisitePart:</summary>
    <br>

    - `AssetPath`: Path to store generated posters.
    - `magickinstalllocation`: Path to ImageMagick installation location where `Magick.exe` is located.
    - `maxLogs`: Number of Log folders you want to keep in `RotatedLogs` Folder (Log History).
    - `font`: Font file name.
    - `backgroundfont`: Background font file name.
    - `overlayfile`: Overlay file name.
    - `backgroundoverlayfile`: Background overlay file name.
    - `titlecardoverlayfile` : Title Card overlay file name.
    - `LibraryFolders`: Set to `false` for asset structure in one flat folder or `true` to split into library media folders like [Plex-Meta-Manager](https://metamanager.wiki/en/latest/pmm/guides/assets/#image-asset-directory-guide) needs it.
    - `SeasonPosters`: Set to `true` to also create season posters.
    - `BackgroundPosters`: Set to `true` to also create background posters.
    - `TitleCards` : Set to `true` to also create title cards.
    </details>
    <details close>
    <summary>OverlayPart:</summary>
    <br>

    - `ImageProcessing`: Set to `true` if you want the ImageMagick part; if false, it only downloads the posters.
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

    - `AddEPText`: Set to `true` to add episode text to the TitleCard image.
    - `fontAllCaps`: Set to `true` for all caps text, else `false`.
    - `fontcolor`: Color of font text.
    - `minPointSize`: Minimum size of text in TitleCard image.
    - `maxPointSize`: Maximum size of text in TitleCard image.
    - `MaxWidth`: Maximum width of text box in TitleCard image.
    - `MaxHeight`: Maximum height of text box in TitleCard image.
    - `text_offset`: Text box offset from the bottom of the TitleCard image.
    </details>
    <br>

3. Rename the config file to `config.json`.
4. Place the `overlay.png`, or whatever file you defined earlier in `overlayfile`, and `Rocky.ttf` font, or whatever font you defined earlier in `font` files in the same directory as PosterMaker.ps1 which is `$ScriptRoot`.

**Usage:**
- **Automatic Mode**: Execute the script without any parameters to generate posters for your entire Plex library.
- **Testing Mode**: Run the script with the `-Testing` switch to create Test posters before you start using it.
- **Manual Mode**: Run the script with the `-Manual` switch to create custom posters manually.

**Note:**
- Ensure PowerShell execution policy allows script execution.
- Bugs or issues encountered during usage can be reported for resolution.

Feel free to customize the script further to meet your specific preferences or automation requirements.

### Automatic Mode

Run the script without any parameters:

```powershell
.\PlexPosterMaker.ps1
```

This will generate posters for your entire Plex library based on the configured settings.

The posters are all placed in `AssetPath\...`. This can then be mounted in Plex-Meta-Manager to use as the assets folder.

### Testing Mode

Run the script with the `-Testing` flag. In this mode, the script will create pink posters/backgrounds with short, medium, and long texts (also in CAPS), using the values specified in the `config.json` file. 

This is handy for testing your configuration before applying it en masse to the actual posters. You can see how and where the text would be applied, as well as the size of the textbox.

```powershell
.\PlexPosterMaker.ps1 -Testing
```


**Images from Testing Mode**

<details close>
<summary>🖼️Posters</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="testing" height="100%" src="/images/testing.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️Backgrounds</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="backgroundtesting" height="100%" src="/images/backgroundtesting.png">
  </a>
</p>
</details>

<details close>
<summary>🖼️TitleCards</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="titlecardtesting" height="100%" src="/images/titlecardtesting.png">
  </a>
</p>
</details>


### Manual Mode (Currently only movie/show/season poster creation integrated)

Run the script with the `-Manual` switch:

```powershell
.\PlexPosterMaker.ps1 -Manual
```

Follow the prompts to enter the source picture path, media folder name, and movie/show title to manually create a custom poster.

### Example Pictures:

<details close>
<summary>🖼️Script folder:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="folder" height="100%" src="/images/folder.png">
  </a>
</p>

</details>

<details close>
<summary>🖼️script output:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="output" height="100%" src="/images/output.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️ImageChoices.csv:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="imagecsv" height="100%" src="/images/imagecsv.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Movie Posters after creation:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="movies" height="520px" src="/images/movies.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Show Posters after creation:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="shows" height="520px" src="/images/shows.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️TitleCards after creation:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="titlecards" height="520px" src="/images/titlecards.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Backgrounds after creation:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="backgrounds" height="520px" src="/images/backgrounds.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️4K Lib after Plex-Meta-Manager magic:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="movies4kpmm" height="100%" src="/images/movies4kpmm.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️Movie Lib after Plex-Meta-Manager magic:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="movies_pmm" height="100%" src="/images/movies_pmm.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️TV Lib after Plex-Meta-Manager magic:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="showspmm" height="520px" src="/images/showspmm.png">
  </a>
</p>
</details>
<details close>
<summary>🖼️TV Lib Seasons after Plex-Meta-Manager magic:</summary>
<br>
<p>
  <a href="https://github.com/fscorrupt/Plex-Poster-Maker" width="100%">
    <img alt="seasonspmm" height="100%" src="/images/seasonspmm.png">
  </a>
</p>
</details>

### Enjoy

Feel free to customize the script further to suit your preferences or automation needs.

PR´s are also welcome!
