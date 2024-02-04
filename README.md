# Plex Poster Maker

This PowerShell script automates the process of generating posters for your Plex media library. The posters are created by using information from your Plex library, such as movie or show title, and fetching relevant artwork from Fanart.tv, TMDB, and TVDB. The script supports both automatic mode and manual mode for creating custom posters that could not generated automatically.

It also generates a csv file with all Movie/Show information that gets queried during Script run.
First run can take a while, after that only missing posters are created (if posters are present in asset directory they get skipped)

## Requirements

Before using this script, make sure you have the following prerequisites installed and configured:

- Powershell 5.1
- **TMDB API Read Access Token:** [Get TMDB API Key](https://www.themoviedb.org/settings/api)
- **Fanart API Key:** [Get Fanart API Key](https://fanart.tv/get-an-api-key)
- **TVDB API Key:** [Get TVDB API Key](https://thetvdb.com/api-information/signup)
- **ImageMagick:** [Download ImageMagick](https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe)
    - i have covered the install process in script.

## Configuration

1. Open `config.example.json` located in the same directory as the script.
2. Update the following variables with your API keys and preferences:
   - `tvdbapi`: Your TVDB project API key.
   - `tmdbtoken`: Your TMDB token.
   - `FanartTvAPIKey`: Your Fanart personal API key.
   - `LibstoExclude`: Libraries to exclude from processing.
   - `TempPath`: Temporary folder path.
   - `AssetPath`: Path to store generated posters.
   - `font`: Font file name.
   - `overlay`: Overlay file name.
   - `magickinstalllocation`: ImageMagick installation location.
   - `PlexUrl`: Plex server URL.
   - `maxCharactersPerLine`: Maximum characters per line on the poster.
   - `targetWidth`: Target width for the final poster.
   - `LibraryFolders`: true/false for the asset structure in one folder or splited in lib folders.
   - `RootFolders`: Specify the Library Root Folders.
   - `PlexToken`: if you want to run this from remote, you have to specify the Plex Token.
3. Rename the config file to `config.json`
4. Copy the `overlay.png` and `Rocky.ttf` font to the same folder where you placed the config.json and script.

## Usage

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

## Note

- Ensure PowerShell execution policy allows script execution.
- The script logs to a file named `Scriptlog.log` in the temporary folder.

### Example of Script folder:
![scriptimage](https://i.imgur.com/MOWuO2i.png)

### Example of script output:
![outputimage](https://i.imgur.com/xzkYB6B.png)

### Example of Posters after creation:
![assetimage](https://i.imgur.com/3Snagbg.png)

### Example of 4K Lib after pmm magic:
![4kimage](https://i.imgur.com/5psJmCU.png)

### Example of Movie Lib after pmm magic:
![movieimage](https://i.imgur.com/Nfdten6.png)

### Example of TV Lib after pmm magic:
![tvimage](https://i.imgur.com/lR6lGzY.jpeg)


Feel free to customize the script further to suit your preferences or automation needs.
