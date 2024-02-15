# Plex Poster Maker

This PowerShell script automates the process of generating posters for your Plex media library. Leveraging information from your Plex library, such as movie or show titles, it fetches relevant artwork from Fanart.tv, TMDB, and TVDB. The script offers both automatic and manual modes for generating posters, accommodating custom creations that cannot be automated.

**Key Features:**
- **Automatic Library Search**: The script autonomously searches for libraries within your Plex server, enhancing its usability.
- **Handling Multiple Versions**: It adeptly manages multiple versions of a movie/show, ensuring comprehensive coverage.
- **CSV Export**: Produces an impressive CSV file containing all queried movie/show information during the script's runtime.
- **Logging Capabilities**: Records valuable information to a file named `Scriptlog.log` in the temporary folder, facilitating troubleshooting and analysis.
- **Cross-platform Compatibility**: Ensures seamless operation across Linux, Docker, and Windows Plex servers, enhancing versatility.
- **Poster Creation**: it Searches fanart/tmdb for textless posters, fallback is grabbing a poster from imdb for movies and tvdb for shows.

Upon initial execution, the script may take some time to run as it compiles necessary data. Subsequent runs efficiently create missing posters, bypassing existing assets in the directory.

**Requirements:**
Before utilizing the script, ensure the following prerequisites are installed and configured:

- **TMDB API Read Access Token:** [Obtain TMDB API Key](https://www.themoviedb.org/settings/api)
- **Fanart API Key:** [Obtain Fanart API Key](https://fanart.tv/get-an-api-key)
- **TVDB API Key:** [Obtain TVDB API Key](https://thetvdb.com/api-information/signup)
- **ImageMagick:** [Download ImageMagick](https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe)
    - Installation is covered within the script.
- Only tested with **Powershell 5.1**.

**Configuration:**
1. Open `config.example.json` located in the script directory.
2. Update the following variables with your API keys and preferences:
   - `tvdbapi`: Your TVDB project API key.
   - `tmdbtoken`: Your TMDB token.
   - `FanartTvAPIKey`: Your Fanart personal API key.
   - `LibstoExclude`: Libraries to exclude from processing.
   - `TempPath`: Temporary folder path.
   - `AssetPath`: Path to store generated posters.
   - `font`: Font file name.
   - `FontSize`: Size of Text in Poster
   - `overlay`: Overlay file name.
   - `magickinstalllocation`: ImageMagick installation location.
   - `PlexUrl`: Plex server URL.
   - `LibraryFolders`: true/false for the asset structure in one flat Folder or splited in lib folders like pmm needs it.
   - `SeasonPosters`: true/false for also creating season posters (if ImageProcessing is false, it queries fanart.tv for season posters, fallback is show poster, because tvdb/tmdb do not have season posters)
   - `PlexToken`: if you want to run this from remote, you have to specify the Plex Token.
   - `ImageProcessing`: Set it to true if you want the imagemagick part, if false it only downloads the posters.
3. Rename the config file to `config.json`.
4. Place the `overlay.png` and `Rocky.ttf` font files in the same directory as the `config.json` and script.

**Usage:**
- **Automatic Mode**: Execute the script without any parameters to generate posters for your entire Plex library.
- **Manual Mode**: Run the script with the `-Manual` switch to create custom posters manually.

**Note:**
- Ensure PowerShell execution policy allows script execution.
- Bugs or issues encountered during usage can be reported for resolution.

Feel free to customize the script further to meet your specific preferences or automation requirements.

### Automatic Mode

Run the script without any parameters:

```powershell
.\PosterMaker.ps1
```

This will generate posters for your entire Plex library based on the configured settings.

The posters are all placed in `AssetPath\...` this can then be mounted in pmm to use as asset folder.

### Manual Mode

Run the script with the `-Manual` switch:

```powershell
.\plex-poster-generator.ps1 -Manual
```

Follow the prompts to enter the source picture path, media folder name, and movie/show title to manually create a custom poster.


### Example of Script folder:
![scriptimage](https://i.imgur.com/MOWuO2i.png)

### Example of script output:
![outputimage](https://i.imgur.com/xzkYB6B.png)

### Example of Posters after creation:
![assetimage](https://i.imgur.com/3Snagbg.png)

### Example of Season Posters after creation:
![assetimage](https://i.imgur.com/xCea7b1.png)

### Example of 4K Lib after pmm magic:
![4kimage](https://i.imgur.com/5psJmCU.png)

### Example of Movie Lib after pmm magic:
![movieimage](https://i.imgur.com/Nfdten6.png)

### Example of TV Lib after pmm magic:
![tvimage](https://i.imgur.com/lR6lGzY.jpeg)

### Example of TV Lib Seasons after pmm magic:
![seasonimage](https://i.imgur.com/yR4xEtW.png)


Feel free to customize the script further to suit your preferences or automation needs.
