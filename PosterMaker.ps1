param (
    [switch]$Manual
)

#################
# What you need #
#####################################################################################################################
# TMDB API Read Access Token    -> https://www.themoviedb.org/settings/api
# FANART API                    -> https://fanart.tv/get-an-api-key
# TVDB API                      -> https://thetvdb.com/api-information/signup
# ImageMagick                   -> https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
# FanartTvAPI Module            -> https://github.com/Celerium/FanartTV-PowerShellWrapper
#####################################################################################################################
function AddTrailingSlash($path) {
    if (-not ($path -match '[\\/]$')) {
        $path += if ($path -match '\\') { '\' } else { '/' }
    }
    return $path
}
function RemoveTrailingSlash($path) {
    if ($path -match '[\\/]$') {
        $path = $path.TrimEnd('\', '/')
    }
    return $path
}
# stolen and adapted from: https://github.com/bullmoose20/Plex-Stuff/blob/9d231d871a4676c8da7d4cbab482181a35756524/create_defaults/create_default_posters.ps1#L477 
Function Get-OptimalPointSize {
    param(
        [string]$text,
        [string]$fontImagemagick,
        [int]$box_width,
        [int]$box_height,
        [int]$min_pointsize,
        [int]$max_pointsize
    )
    # Construct the command with correct font option
    $cmd = "magick.exe -size ${box_width}x${box_height} -font `"$fontImagemagick`" -gravity center -fill black caption:`"$text`" -format `"%[caption:pointsize]`" info:"
    $cmd | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
    # Execute command and get point size
    $current_pointsize = [int](Invoke-Expression $cmd | Out-String).Trim()
    # Apply point size limits
    if ($current_pointsize -gt $max_pointsize) {
        $current_pointsize = $max_pointsize
    }
    elseif ($current_pointsize -lt $min_pointsize) {
        Write-Host "    WARNING! Text truncated! optimalFontSize: $current_pointsize below min_pointsize: $min_pointsize" -ForegroundColor Red
        "    WARNING! Text truncated! optimalFontSize: $current_pointsize below min_pointsize: $min_pointsize" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        $current_pointsize = $min_pointsize
    }

    # Return optimal point size
    return $current_pointsize
}
function GetTMDBPoster {
    $global:Fallback = $null
    if ($global:IsMovie -eq $true) {
        Write-Host "    Searching on TMDB for a movie poster"
        "    Searching on TMDB for a movie poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-Host "    Found Poster with text on TMDB: $global:posterurl" -ForegroundColor Blue
                    "    Found Poster with text on TMDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                    if ($global:FavProvider -eq 'tmdb') {
                        $global:Fallback = "fanart"
                    }
                    Else {
                        Write-Host "    No Textless poster on TMDB"
                        "    No Textless poster on TMDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        return $global:posterurl
                    }
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-Host "    Found Textless Poster on TMDB: $global:posterurl" -ForegroundColor Green
                    "    Found Textless Poster on TMDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                    return $global:posterurl
                }
            }
        }
        Else {
            Write-Host "    No Poster found on TMDB" -ForegroundColor Yellow
            "    No Poster found on TMDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
    }
    if ($global:IsShow -eq $true) {
        if ($global:IsTemp -eq $true) {
        }
        Else {
            Write-Host "    Searching on TMDB for a show poster"
            "    Searching on TMDB for a show poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:IsTemp -eq $true -and !($global:DisplayOutput)) {
                    }
                    Else {
                        Write-Host "    Found Poster with text on TMDB: $global:posterurl" -ForegroundColor blue
                        "    Found Poster with text on TMDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                    }
                    if ($global:FavProvider -eq 'tmdb') {
                        $global:Fallback = "fanart"
                    }
                    Else {
                        if ($global:IsTemp -eq $true -and !($global:DisplayOutput)) {
                        }
                        Else {
                            Write-Host "    No Textless poster on TMDB"
                            "    No Textless poster on TMDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        return $global:posterurl
                    }
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:IsTemp -eq $true -and !($global:DisplayOutput)) {
                    }
                    Else {
                        Write-Host "    Found Textless Poster on TMDB: $global:posterurl" -ForegroundColor Green
                        "    Found Textless Poster on TMDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                    }
                    return $global:posterurl
                }
            }
        }
        Else {
            if ($global:IsTemp -eq $true -and !($global:DisplayOutput)) {
            }
            Else {
                Write-Host "    No Poster found on TMDB" -ForegroundColor Yellow
                "    No Poster found on TMDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            }
        }
    }
}
function GetFanartPoster {
    $global:Fallback = $null
    if ($global:IsMovie -eq $true) {
        Write-Host "    Searching on Fanart.tv for a movie poster"
        "    Searching on Fanart.tv for a movie poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null
        
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    if (!($entrytemp.movieposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.movieposter)[0].url
                        Write-Host "    Found Poster with text on Fanart.tv: $global:posterurl" -ForegroundColor Blue
                        "    Found Poster with text on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        if ($global:FavProvider -eq 'fanart') {
                            $global:Fallback = "tmdb"
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.movieposter | Where-Object lang -eq '00')[0].url
                        Write-Host "    Found Textless Poster on Fanart.tv: $global:posterurl" -ForegroundColor Green
                        "    Found Textless Poster on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-Host "    No movie match or poster found on Fanart.tv" -ForegroundColor red
            "    No movie match or poster found on Fanart.tv" | Out-File $global:ScriptRoot\Logs\PosterCreation.log -Append
            $global:Fallback = "tmdb"
        }
        Else {
            return $global:posterurl
        }
    }
    if ($global:IsShow -eq $true) {
        if ($global:IsTemp -eq $true) {
        }
        Else {
            Write-Host "    Searching on Fanart.tv for a show poster"
            "    Searching on Fanart.tv for a show poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    if (!($entrytemp.tvposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.tvposter)[0].url
                        if ($global:IsTemp -eq $true) {
                        }
                        Else {
                            Write-Host "    Found Poster with text on Fanart.tv: $global:posterurl" -ForegroundColor Blue
                            "    Found Poster with text on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        if ($global:FavProvider -eq 'fanart') {
                            $global:Fallback = "tmdb"
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.tvposter | Where-Object lang -eq '00')[0].url
                        if ($global:IsTemp -eq $true) {
                        }
                        Else {
                            Write-Host "    Found Textless Poster on Fanart.tv: $global:posterurl" -ForegroundColor Green
                            "    Found Textless Poster on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {
            if ($global:IsTemp -eq $true) {
            }
            Else {
                Write-Host "    No show match or poster found on Fanart.tv" -ForegroundColor red
                "    No show match or poster found on Fanart.tv" | Out-File $global:ScriptRoot\Logs\PosterCreation.log -Append
            }
            $global:Fallback = "tmdb"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartSeasonPoster {
    $global:Fallback = $null
    if ($global:IsShow -eq $true) {
        if ($global:SeasonPosters -eq $true -and $global:ImageProcessing -eq $true) {
            Write-Host "    Searching on Fanart.tv for a fallback Season poster"
            "    Searching on Fanart.tv for a temp fallback poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
            $entrytemp = $null
    
            foreach ($id in $ids) {
                if ($id) {
                    $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                    if ($entrytemp -and $entrytemp.tvposter) {
                        if (!($entrytemp.tvposter | Where-Object lang -eq '00')) {
                            $global:posterurl = ($entrytemp.tvposter)[0].url
                            Write-Host "    Found Poster with text on Fanart.tv: $global:posterurl" -ForegroundColor Blue
                            "    Found Poster with text on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            $global:Fallback = "tmdb"
                            break
                        }
                        Else {
                            $global:posterurl = ($entrytemp.tvposter | Where-Object lang -eq '00')[0].url
                            Write-Host "    Found Textless Poster on Fanart.tv: $global:posterurl" -ForegroundColor Green
                            "    Found Textless Poster on Fanart.tv: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            break
                        }
                    }
                }
            }
    
            if (!$global:posterurl) {
                Write-Host "    No show match or poster found on Fanart.tv" -ForegroundColor red
                "    No show match or poster found on Fanart.tv" | Out-File $global:ScriptRoot\Logs\PosterCreation.log -Append
                $global:Fallback = "tmdb"
            }
            Else {
                return $global:posterurl
            }
        }
        if ($global:SeasonPosters -eq $true -and $global:ImageProcessing -eq $false) {
            Write-Host "    Searching on Fanart.tv for a season poster"
            "    Searching on Fanart.tv for a season poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
            $entrytemp = $null
    
            foreach ($id in $ids) {
                if ($id) {
                    $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                    if ($entrytemp.seasonposter) {
                        if ($global:season -eq 'Season00') {
                            $global:SeasonNumber = 0
                        }
                        $global:posterurl = ($entrytemp.seasonposter | Where-Object { $_.lang -eq 'en' -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)[0].url
                        break
                    }
                    Else {
                        $global:posterurl = $null
                        break
                    }
                }
            }
            if ($global:posterurl) {
                return $global:posterurl
            }
            Else {
                return $global:fallbackurl
            }
        }
    }
}
function GetTVDBPoster {
    if ($global:IsMovie -eq $true -and $global:tvdbid) {
        Write-Host "    Searching on TVDB for a movie poster"
        "    Searching on TVDB for a movie poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
        }
        if ($response) {
            if ($response.data.image) {
                $global:posterurl = $response.data.image
                Write-Host "    Found Poster with text on TVDB: $global:posterurl" -ForegroundColor Blue
                "    Found Poster with text on TVDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                return $global:posterurl
            }
            Else {
                Write-Host "    No Poster found on TVDB" -ForegroundColor Yellow
                "    No Poster found on TVDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            }
        }
        Else {
            Write-Host "    No Poster found on TVDB" -ForegroundColor Yellow
            "    No Poster found on TVDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
    }
    if ($global:IsShow -eq $true -and $global:tvdbid) {
        Write-Host "    Searching on TVDB for a show poster"
        "    Searching on TVDB for a show poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
        }
        if ($response) {
            if ($response.data.image) {
                $global:posterurl = $response.data.image
                Write-Host "    Found Poster with text on TVDB: $global:posterurl" -ForegroundColor Blue
                "    Found Poster with text on TVDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                return $global:posterurl
            }
            Else {
                Write-Host "    No Poster found on TVDB: $global:posterurl" -ForegroundColor Yellow
                "    No Poster found on TVDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            }
        }
        Else {
            Write-Host "    No Poster found on TVDB" -ForegroundColor Yellow
            "    No Poster found on TVDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
    }
}
function GetIMDBPoster {
    $response = Invoke-WebRequest -Uri "https://www.imdb.com/title/$($global:imdbid)/mediaviewer" -Method GET
    $global:posterurl = $response.images.src[1]
    if (!$global:posterurl) {
        Write-Host "    No show match or poster found on IMDB" -ForegroundColor red
        "    No show match or poster found on IMDB" | Out-File $global:ScriptRoot\Logs\PosterCreation.log -Append
    }
    Else {
        Write-Host "    Found Poster with text on IMDB: $global:posterurl" -ForegroundColor Blue
        "    Found Poster with text on IMDB: $global:posterurl" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        return $global:posterurl
    }
}
# Check if Config file is present
if (!(Test-Path "$PSScriptRoot\config.json")) {
    Write-Host "Config File missing, downloading it for you..."
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/raw/main/config.example.json" -OutFile "$PSScriptRoot\config.json"
    Write-Host "    Config File downloaded here: '$PSScriptRoot\config.json'"
    Write-Host "    Please configure the config file according to GH, exit script now..." -ForegroundColor Yellow
    pause
    exit
}

# load config file
$config = Get-Content -Raw -Path "$PSScriptRoot\config.json" | ConvertFrom-Json

# Access variables from the config file
# Api Part
$global:tvdbapi = $config.ApiPart.tvdbapi
$global:tmdbtoken = $config.ApiPart.tmdbtoken
$FanartTvAPIKey = $config.ApiPart.FanartTvAPIKey
$PlexToken = $config.ApiPart.PlexToken
$global:FavProvider = $config.ApiPart.FavProvider

# default to fanart if favprovider missing
if (!$global:FavProvider) {
    $global:FavProvider = 'fanart'
}

# Plex Part
$LibstoExclude = $config.PlexPart.LibstoExclude
$PlexUrl = $config.PlexPart.PlexUrl
# Prerequisites Part
$AssetPath = RemoveTrailingSlash $config.PrerequisitePart.AssetPath
$global:ScriptRoot = $PSScriptRoot
$magickinstalllocation = RemoveTrailingSlash $config.PrerequisitePart.magickinstalllocation
$font = "$global:ScriptRoot\temp\$($config.PrerequisitePart.font)"
$overlay = "$global:ScriptRoot\temp\$($config.PrerequisitePart.overlayfile)"
$LibraryFolders = $config.PrerequisitePart.LibraryFolders
$global:SeasonPosters = $config.PrerequisitePart.SeasonPosters
# Overlay Part
$global:ImageProcessing = $config.OverlayPart.ImageProcessing
$fontAllCaps = $config.OverlayPart.fontAllCaps
$AddBorder = $config.OverlayPart.AddBorder
$AddText = $config.OverlayPart.AddText
$AddOverlay = $config.OverlayPart.AddOverlay
$fontcolor = $config.OverlayPart.fontcolor
$bordercolor = $config.OverlayPart.bordercolor
$minPointSize = $config.OverlayPart.minPointSize
$maxPointSize = $config.OverlayPart.maxPointSize
$borderwidth = $config.OverlayPart.borderwidth
$MaxWidth = $config.OverlayPart.MaxWidth
$MaxHeight = $config.OverlayPart.MaxHeight
$text_offset = $config.OverlayPart.text_offset

$borderwidthsecond = $borderwidth + 'x' + $borderwidth
$boxsize = $MaxWidth + 'x' + $MaxHeight

$fontImagemagick = $font.replace('\', '\\')
$magick = "$magickinstalllocation\magick.exe"
$fileExtensions = @(".otf", ".ttf", ".otc", ".ttc")

if (!(Test-Path $global:ScriptRoot\Logs)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\Logs -Force | out-null
}

if (!(Test-Path $global:ScriptRoot\temp)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot\temp -Force | out-null
}

if (!(Test-Path $AssetPath)) {
    New-Item -ItemType Directory -Path $AssetPath -Force | out-null
}

# Delete all files and subfolders within the temp directory
if (Test-Path $global:ScriptRoot\temp) {
    Remove-Item -Path $global:ScriptRoot\temp\* -Recurse -Force
}

# Test if files are present in Script root
if (!(Test-Path $overlay)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/raw/main/overlay.png" -OutFile $global:ScriptRoot\temp\overlay.png 
}
if (!(Test-Path $font)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/raw/main/Rocky.ttf" -OutFile $global:ScriptRoot\temp\Rocky.ttf
}

if (!$Manual) {
    Write-Host "Cleanup old log file..."
    "Cleanup old log file..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    # cleanup old logfile
    if ((Test-Path $global:ScriptRoot\Logs\Scriptlog.log)) {
        Remove-Item $global:ScriptRoot\Logs\Scriptlog.log
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageMagickCommands.log)) {
        Remove-Item $global:ScriptRoot\Logs\ImageMagickCommands.log
    }
    if ((Test-Path $global:ScriptRoot\Logs\PosterCreation.log)) {
        Remove-Item $global:ScriptRoot\Logs\PosterCreation.log
    }
}

# Get files in script root with specified extensions
$files = Get-ChildItem -Path $global:ScriptRoot -File | Where-Object { $_.Extension -in $fileExtensions } -ErrorAction SilentlyContinue

# Copy files to the destination directory
foreach ($file in $files) {
    $destinationPath = Join-Path -Path $global:ScriptRoot\temp -ChildPath $file.Name
    if (!(Test-Path -LiteralPath $destinationPath)) {
        Copy-Item -Path $file.FullName -Destination $destinationPath -Force | out-null
        Write-Host "    Found font: '$($file.Name)' in ScriptRoot - copy it into temp folder..."
        "    Found font: '$($file.Name)' in ScriptRoot - copy it into temp folder..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    }
}

if ($PlexToken) {
    Write-Host "Plex token found, checking access now..."
    "Plex token found, checking access now..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    if ((Invoke-WebRequest "$PlexUrl/?X-Plex-Token=$PlexToken").StatusCode -eq 200) {
        Write-Host "    Plex access is working..." -ForegroundColor Green
        "Plex access is working..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken").content
    }
    Else {
        Write-Host "Could not access plex with this url: $PlexUrl/?X-Plex-Token=$PlexToken" -ForegroundColor red
        Write-Host "    Please check token and access..." -ForegroundColor red
        pause
        exit
    }
}
Else {
    Write-Host "Checking Plex access now..."
    "Checking Plex access now..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    if ((Invoke-WebRequest "$PlexUrl").StatusCode -eq 200) {
        Write-Host "    Plex access is working..." -ForegroundColor Green
        "Plex access is working..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections").content
    }
    Else {
        Write-Host "Could not access plex with this url: $PlexUrl" -ForegroundColor red
        Write-Host "    Please check access and settings in plex..." -ForegroundColor red
        write-host "To be able to connect to plex without Auth"
        write-host "You have to enter your ip range in 'Settings -> Network -> List of IP addresses and networks that are allowed without auth: '192.168.1.0/255.255.255.0''"
        pause
        exit
    }
}

if (!(Test-Path $magick)) {
    Write-Host "ImageMagick missing, downloading/installing it for you..." -ForegroundColor Red
    "ImageMagick missing, downloading/installing it for you..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    $InstallArguments = "/verysilent /DIR=`"$magickinstalllocation`""
    Invoke-WebRequest https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -OutFile $global:ScriptRoot\temp\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
    Start-Process $global:ScriptRoot\temp\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -ArgumentList $InstallArguments -NoNewWindow -Wait
    Write-Host "    ImageMagick installed here: $magickinstalllocation" -ForegroundColor Green
    "ImageMagick installed here: $magickinstalllocation" | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    Remove-Item $global:ScriptRoot\temp\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -Force | out-null
}
# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-Host "FanartTvAPI Module missing, installing it for you..." -ForegroundColor Red
    "FanartTvAPI Module missing, installing it for you..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber
    
    Write-Host "    FanartTvAPI Module installed, importing it now..." -ForegroundColor Green
    "FanartTvAPI Module installed, importing it now..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    Import-Module -Name FanartTvAPI
}
# Add Fanart Api
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# tmdb Header
$global:headers = @{}
$global:headers.Add("accept", "application/json")
$global:headers.Add("Authorization", "Bearer $global:tmdbtoken")

# tvdb token Header
$global:apiUrl = "https://api4.thetvdb.com/v4/login"
$global:requestBody = @{
    apikey = $global:tvdbapi
} | ConvertTo-Json

# tvdb Header
$global:tvdbtokenheader = @{
    'accept'       = 'application/json'
    'Content-Type' = 'application/json'
}
# Make tvdb the POST request
$global:tvdbtoken = (Invoke-RestMethod -Uri $global:apiUrl -Headers $global:tvdbtokenheader -Method Post -Body $global:requestBody).data.token
$global:tvdbheader = @{}
$global:tvdbheader.Add("accept", "application/json")
$global:tvdbheader.Add("Authorization", "Bearer $global:tvdbtoken")

if ($Manual) {
    Clear-Host
    Write-Host ""
    Write-Host "Manual Poster Creation Started" -ForegroundColor Yellow
    Write-Host ""
    $PicturePath = Read-Host "Enter path to source picture"
    $FolderName = Read-Host "Enter Media Foldername (how plex sees it)"
    $Titletext = Read-Host "Enter Movie/Show Title"
    $CreateSeasonPoster = Read-Host "Create Season Poster? (y/n)"

    $PicturePath = $PicturePath.replace('"', '')
    $FolderName = $FolderName.replace('"', '')
    $Titletext = $Titletext.replace('"', '')

    if ($LibraryFolders -eq 'true') {
        $LibraryName = Read-Host "Enter Plex Library Name"
        $LibraryName = $LibraryName.replace('"', '')
        $backgroundImageoriginal = "$AssetPath\$LibraryName\$FolderName\poster.jpg"
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($season -eq 'Specials') {
                $season = "Season00"
            }  
            $backgroundImageoriginal = "$AssetPath\$LibraryName\$FolderName\$season.jpg"
        }
    }
    Else {
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($season -eq 'Specials') {
                $season = "Season00"
            }  
            $backgroundImageoriginal = "$AssetPath\$($FolderName)_$season.jpg"
        }
    }

    $backgroundImage = "$global:ScriptRoot\temp\$FolderName.jpg"
    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    if ($global:ImageProcessing -eq 'true') {
        if ($CreateSeasonPoster -eq 'y') {
            if ($fontAllCaps -eq 'true') {
                $joinedTitle = $SeasonPosterName.ToUpper()
            }
            Else {
                $joinedTitle = $SeasonPosterName
            }
        }
        Else {
            if ($fontAllCaps -eq 'true') {
                $joinedTitle = $Titletext.ToUpper()
            }
            Else {
                $joinedTitle = $Titletext
            }
        }
        Move-Item -LiteralPath $PicturePath -destination $backgroundImage -Force -ErrorAction SilentlyContinue
        Write-Host "    Processing Poster for: " -NoNewline -ForegroundColor Cyan
        Write-Host `"$joinedTitle`" -ForegroundColor Yellow
        "    Processing Poster for: `"$joinedTitle`"" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append

        # Resize Image to 2000x3000 and apply Border and overlay
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
            Write-Host "    Resizing it | Adding Borders | Adding Overlay"
            "    Resizing it | Adding Borders | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
            Write-Host "    Resizing it | Adding Borders"
            "    Resizing it | Adding Borders" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$backgroundImage`""
            Write-Host "    Resizing it | Adding Overlay"
            "    Resizing it | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
            Write-Host "    Resizing it"
            "    Resizing it" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        }

        $logEntry = "magick.exe $Arguments"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

        if ($AddText -eq 'true') {
            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
            Write-Host "    Optimal font size set to: '$optimalFontSize'"
            "    Optimal font size set to: '$optimalFontSize'" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$backgroundImage`""
            Write-Host "    Applying Font text: `"$joinedTitle`""
            "    Applying Font text: `"$joinedTitle`"" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
            $logEntry = "magick.exe $Arguments"
            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        }
    }
    Else {
        # Resize Image to 2000x3000
        $Resizeargument = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
        Write-Host "    Resizing it... "
        "    Resizing it... " | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
        $logEntry = "magick.exe $Resizeargument"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
    }
    # Move file back to original naming with Brackets.
    Move-Item -LiteralPath $backgroundImage -destination $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
    Write-Host "Poster created and moved to: $backgroundImageoriginal" -ForegroundColor Green
}
else {
    Write-Host "Query plex libs..." -ForegroundColor Cyan
    "Query plex libs..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    $Libsoverview = @()
    foreach ($lib in $libs.MediaContainer.Directory) {
        if ($lib.title -notin $LibstoExclude) {
            $libtemp = New-Object psobject
            $libtemp | Add-Member -MemberType NoteProperty -Name "ID" -Value $lib.key
            $libtemp | Add-Member -MemberType NoteProperty -Name "Name" -Value $lib.title
            
            # Check if $lib.location.path is an array
            if ($lib.location.path -is [array]) {
                $paths = $lib.location.path -join ',' # Convert array to string
                $libtemp | Add-Member -MemberType NoteProperty -Name "Path" -Value $paths
            }
            else {
                $libtemp | Add-Member -MemberType NoteProperty -Name "Path" -Value $lib.location.path
            }
            
            $Libsoverview += $libtemp
        }
    }
    Write-Host "    Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..."
    "Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append

    Write-Host "Query all items from all Libs, this can take a while..." -ForegroundColor Yellow
    "Query all items from all Libs, this can take a while..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    #$Libraries = Import-Csv "C:\posterTemp\logs\PlexLibexport.csv" -Delimiter ';' 
    #<#
    $Libraries = @()
    Foreach ($Library in $Libsoverview) {
        if ($Library.Name -notin $LibstoExclude) {
            if ($PlexToken) {
                [xml]$Libcontent = (Invoke-WebRequest $PlexUrl/library/sections/$($Library.ID)/all?X-Plex-Token=$PlexToken).content
            }
            Else {
                [xml]$Libcontent = (Invoke-WebRequest $PlexUrl/library/sections/$($Library.ID)/all).content
            }
            if ($Libcontent.MediaContainer.video) {
                $contentquery = 'video'
            }
            Else {
                $contentquery = 'Directory'
            }
            foreach ($item in $Libcontent.MediaContainer.$contentquery) {
                $Seasondata = $null
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children?X-Plex-Token=$PlexToken).content
                    }
                    [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken).content
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children?).content
                    }
                    [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)).content
                }
                $metadatatemp = $Metadata.MediaContainer.$contentquery.guid.id
                $tmdbpattern = 'tmdb://(\d+)'
                $imdbpattern = 'imdb://tt(\d+)'
                $tvdbpattern = 'tvdb://(\d+)'
                if ($Metadata.MediaContainer.$contentquery.Location) {
                    $location = $Metadata.MediaContainer.$contentquery.Location.path
                    if ($location.count -gt '1') {
                        $location = $location[0]
                        $MultipleVersions = $true
                    }
                    Else {
                        $MultipleVersions = $false
                    }
                    $libpaths = $($Library.path).split(',')
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath*") {
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                        }
                    }
                }
                Else {
                    $location = $Metadata.MediaContainer.$contentquery.media.part.file
                    if ($location.count -gt '1') {
                        $location = $location[0]
                        $MultipleVersions = $true
                    }
                    Else {
                        $MultipleVersions = $false
                    }
                    $libpaths = $($Library.path).split(',')
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath*") {
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                            if ($extractedFolder -like '*\*') {
                                $extractedFolder = $extractedFolder.split('\')[0]
                            }
                            if ($extractedFolder -like '*/*') {
                                $extractedFolder = $extractedFolder.split('/')[0]
                            }
                        }
                    }
                }
                if ($Seasondata) {
                    $pattern = '\d+'
                    $SeasonsTemp = $Seasondata.MediaContainer.Directory | Where-Object { $_.Title -match $pattern -or $_.Title -like '*specials*' }
                    $SeasonNames = $SeasonsTemp.Title -join ','
                }

                $matchesimdb = [regex]::Matches($metadatatemp, $imdbpattern)
                $matchestmdb = [regex]::Matches($metadatatemp, $tmdbpattern)
                $matchestvdb = [regex]::Matches($metadatatemp, $tvdbpattern)
                if ($matchesimdb.value) { $imdbid = $matchesimdb.value.Replace('imdb://', '') }Else { $imdbid = $null }
                if ($matchestmdb.value) { $tmdbid = $matchestmdb.value.Replace('tmdb://', '') }Else { $tmdbid = $null }
                if ($matchestvdb.value) { $tvdbid = $matchestvdb.value.Replace('tvdb://', '') }Else { $tvdbid = $null }

                # check if there are more then 1 entry in id´s
                if ($tvdbid.count -gt '1') { $tvdbid = $tvdbid[0] }
                if ($tmdbid.count -gt '1') { $tmdbid = $tmdbid[0] }
                if ($imdbid.count -gt '1') { $imdbid = $imdbid[0] }

                $temp = New-Object psobject
                $temp | Add-Member -MemberType NoteProperty -Name "Library Name" -Value $Library.Name
                $temp | Add-Member -MemberType NoteProperty -Name "Library Type" -Value $Metadata.MediaContainer.$contentquery.type
                $temp | Add-Member -MemberType NoteProperty -Name "title" -Value $($item.title)
                $temp | Add-Member -MemberType NoteProperty -Name "originalTitle" -Value $($item.originalTitle)
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonNames" -Value $SeasonNames
                $temp | Add-Member -MemberType NoteProperty -Name "year" -Value $item.year
                $temp | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $tvdbid
                $temp | Add-Member -MemberType NoteProperty -Name "imdbid" -Value $imdbid
                $temp | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $tmdbid
                $temp | Add-Member -MemberType NoteProperty -Name "ratingKey" -Value $item.ratingKey
                $temp | Add-Member -MemberType NoteProperty -Name "Path" -Value $Matchedpath
                $temp | Add-Member -MemberType NoteProperty -Name "RootFoldername" -Value $extractedFolder
                $temp | Add-Member -MemberType NoteProperty -Name "MultipleVersions" -Value $MultipleVersions
                $Libraries += $temp
            }
        }
    }
    Write-Host "    Found '$($Libraries.count)' Items..." -ForegroundColor Cyan
    "Found '$($Libraries.count)' Items..."  | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    $Libraries | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
    Write-Host "Export everything to a csv: $global:ScriptRoot\Logs\PlexLibexport.csv"
    "Export everything to a csv: $global:ScriptRoot\Logs\PlexLibexport.csv" | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    #>
    # Download poster foreach movie
    Write-Host ''
    Write-Host "Starting poster creation now, this can take a while..." -ForegroundColor Yellow
    "Starting poster creation now, this can take a while..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    # Initialize counter variable
    $posterCount = 0
    $SeasonCount = 0
    foreach ($entry in $Libraries) {
        try {
            if ($($entry.RootFoldername)) {
                $cjkPattern = '[\p{IsHiragana}\p{IsKatakana}\p{IsCJKUnifiedIdeographs}\p{IsCyrillic}]'
                if ($entry.title -match $cjkPattern) {
                    $Titletext = $entry.originalTitle
                }
                else {
                    $Titletext = $entry.title
                }

                if ($LibraryFolders -eq 'true') {
                    $LibraryName = $entry.'Library Name'
                    $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                    $backgroundImageoriginal = "$EntryDir\poster.jpg"
                    
                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                }

                $backgroundImage = "$global:ScriptRoot\temp\$($entry.RootFoldername).jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                    if ($entry.'Library Type' -eq 'movie') {
                        $posterurl = $null
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:IsMovie = $true
                        $global:IsShow = $false
                        Write-Host "Start Poster Search for: $Titletext" -ForegroundColor Yellow
                        "Start Poster Search for: $Titletext" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        if ($global:FavProvider -eq 'tmdb' -and $entry.tmdbid) {
                            $global:posterurl = GetTMDBPoster
                        }
                        if ($global:FavProvider -eq 'fanart') {
                            $global:posterurl = GetFanartPoster
                        }
                        if ($global:FavProvider -eq 'tvdb' -and $entry.tvdbid) {
                            $global:posterurl = GetTVDBPoster
                        }
                        if ($global:Fallback -eq 'fanart') {
                            $global:posterurl = GetFanartPoster
                        }
                        if ($global:Fallback -eq 'tmdb' -and $entry.tmdbid) {
                            $global:posterurl = GetTMDBPoster
                        }
                        if (!$global:posterurl){
                            Write-Host "    Searching on TVDB for a movie poster"
                            "    Searching on TVDB for a movie poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            $global:posterurl = GetTVDBPoster
                            if (!$global:posterurl){ 
                                Write-Host "    Searching on IMDB for a movie poster"
                                "    Searching on IMDB for a movie poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                $global:posterurl = GetIMDBPoster
                            }
                        }
                    }
                    if ($entry.'Library Type' -eq 'show') {
                        $posterurl = $null
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:IsMovie = $false
                        $global:IsShow = $true
                        $global:IsTemp = $null

                        Write-Host "Start Poster Search for: $Titletext" -ForegroundColor Yellow
                        "Start Poster Search for: $Titletext" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append

                        if ($global:FavProvider -eq 'tmdb' -and $entry.tmdbid) {
                            $global:posterurl = GetTMDBPoster
                        }
                        if ($global:FavProvider -eq 'fanart') {
                            $global:posterurl = GetFanartPoster
                        }
                        if ($global:FavProvider -eq 'tvdb' -and $entry.tvdbid) {
                            $global:posterurl = GetTVDBPoster
                        }
                        if ($global:Fallback -eq 'fanart') {
                            $global:posterurl = GetFanartPoster
                        }
                        if ($global:Fallback -eq 'tmdb' -and $entry.tmdbid) {
                            $global:posterurl = GetTMDBPoster
                        }
                        if (!$global:posterurl){
                            Write-Host "    Searching on TVDB for a show poster"
                            "    Searching on TVDB for a show poster" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            $global:posterurl = GetTVDBPoster
                        }
                    }

                    if ($fontAllCaps -eq 'true') {
                        $joinedTitle = $Titletext.ToUpper()
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    Invoke-WebRequest -Uri $global:posterurl -OutFile $backgroundImage

                    if ($global:ImageProcessing -eq 'true') {
                        Write-Host "    Processing Poster for: " -NoNewline -ForegroundColor Cyan
                        Write-Host `"$joinedTitle`" -ForegroundColor Yellow
                        "    Processing Poster for: `"$joinedTitle`"" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append

                        # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                            Write-Host "    Resizing it | Adding Borders | Adding Overlay"
                            "    Resizing it | Adding Borders | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$backgroundImage`""
                            Write-Host "    Resizing it | Adding Borders"
                            "    Resizing it | Adding Borders" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$backgroundImage`""
                            Write-Host "    Resizing it | Adding Overlay"
                            "    Resizing it | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                            Write-Host "    Resizing it"
                            "    Resizing it" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        }
                        $logEntry = "magick.exe $Arguments"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

                        if ($AddText -eq 'true') {
                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                            Write-Host "    Optimal font size set to: '$optimalFontSize'"
                            "    Optimal font size set to: '$optimalFontSize'" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$backgroundImage`""
                            Write-Host "    Applying Font text: `"$joinedTitle`""
                            "    Applying Font text: `"$joinedTitle`"" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                            $logEntry = "magick.exe $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                        }
                    }
                    Else {
                        $Resizeargument = "`"$backgroundImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$backgroundImage`""
                        Write-Host "    Resizing it... "
                        "    Resizing it... " | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                        $logEntry = "magick.exe $Resizeargument"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                    }
                    # Move file back to original naming with Brackets.
                    Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                    Write-Host '---------------------------------------------------------'
                    '---------------------------------------------------------' | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                    $posterCount++
                }
                # Create Season Posters
                if ($global:SeasonPosters -eq 'true' -and $entry.'Library Type' -eq 'show') {
                    $global:posterurl = $null
                    $global:ismissing = $null
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:IsMovie = $false
                    $global:IsShow = $true
                    $global:IsTemp = $true
                    $global:Fallback = $null

                    $global:posterurl = GetFanartPoster
                    if ($global:Fallback -eq 'tmdb' -and $entry.tmdbid) {
                        $global:posterurl = GetTMDBPoster
                    }
                    #Temp download
                    $global:SeasonTempPoster = "$global:ScriptRoot\temp\SeasonTemp.jpg"
                    if ((Get-ChildItem -LiteralPath $global:SeasonTempPoster -ErrorAction SilentlyContinue)) {
                        Remove-Item  $global:SeasonTempPoster -Force | out-null
                    }

                    $seasonNames = $entry.SeasonNames -split ','
                    foreach ($season in $seasonNames) {
                        if ($fontAllCaps -eq 'true') {
                            $seasonTitle = $season.ToUpper()
                        }
                        Else {
                            $seasonTitle = $season
                        }
                        if ($season -match 'Season\s+(\d+)') {
                            $global:SeasonNumber = $Matches[1]
                            $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
                        }
                        if ($season -eq 'Specials') {
                            $global:season = "Season00"
                        }    
                        if ($LibraryFolders -eq 'true') {
                            $SeasonImageoriginal = "$EntryDir\$season.jpg"
                        }
                        Else {
                            $SeasonImageoriginal = "$AssetPath\$($entry.RootFoldername)_$season.jpg"
                        }
                        $SeasonImage = "$global:ScriptRoot\temp\$($entry.RootFoldername)_$season.jpg"
                        $SeasonImage = $SeasonImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                        if (!(Get-ChildItem -LiteralPath $SeasonImageoriginal -ErrorAction SilentlyContinue)) {
                            $global:ismissing = $true
                            if ($global:ImageProcessing -eq 'true') {
                                if (!(Get-ChildItem -LiteralPath $global:SeasonTempPoster -ErrorAction SilentlyContinue)) {
                                    $global:posterurl = GetFanartSeasonPoster
                                    if ($global:Fallback -eq 'tmdb' -and $entry.tmdbid) {
                                        $global:DisplayOutput = $True
                                        $global:posterurl = GetTMDBPoster
                                        $global:DisplayOutput = $null
                                    }
                                    
                                    if ($global:posterurl) {
                                        Invoke-WebRequest -Uri $global:posterurl -OutFile $global:SeasonTempPoster
                                    }
                                    Else {
                                        $global:posterurl = GetTVDBPoster
                                        if (!$global:posterurl){
                                            Write-Host "No Poster Url found for: $($entry.title) - Please manually Create Posters..." -ForegroundColor Red
                                            "No Poster Url found for: $($entry.title) - Please manually Create Posters..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
                                        }
                                        Else{
                                            Invoke-WebRequest -Uri $global:posterurl -OutFile $global:SeasonTempPoster
                                        }
                                    }
                                }
                                if ($global:posterurl) {
                                    Copy-Item -LiteralPath $global:SeasonTempPoster $SeasonImage -Force | out-null
                                    # Resize Image to 2000x3000 and apply Border and overlay
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-Host "    Resizing it | Adding Borders | Adding Overlay"
                                        "    Resizing it | Adding Borders | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                    }
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-Host "    Resizing it | Adding Borders"
                                        "    Resizing it | Adding Borders" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$overlay`" -gravity south -composite `"$SeasonImage`""
                                        Write-Host "    Resizing it | Adding Overlay"
                                        "    Resizing it | Adding Overlay" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$SeasonImage`""
                                        Write-Host "    Resizing it"
                                        "    Resizing it" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                    }

                                    $logEntry = "magick.exe $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

                                    if ($AddText -eq 'true') {
                                        $optimalFontSize = Get-OptimalPointSize -text $seasonTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                        
                                        Write-Host "    Optimal font size set to: '$optimalFontSize'"
                                        "    Optimal font size set to: '$optimalFontSize'" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                        
                                        $Arguments = "`"$SeasonImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$seasonTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -composite `"$SeasonImage`""
                                        
                                        Write-Host "    Applying Font text: `"$seasonTitle`""
                                        "    Applying Font text: `"$seasonTitle`"" | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                        $logEntry = "magick.exe $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                    }
                                }
                            }
                            Else {
                                # Get Season poster from fanart, fallback to poster if missing
                                if ($global:posterurl) {
                                    $fallbackurl = $global:posterurl
                                }
                                $global:posterurl = GetFanartSeasonPoster
                                if ($global:posterurl) {
                                    Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage
                                }
                                Else {
                                    Invoke-WebRequest -Uri $fallbackurl -OutFile $SeasonImage
                                }
                                    
                                # Resize Image to 2000x3000
                                $Resizeargument = "`"$SeasonImage`" -resize 2000x3000^ -gravity center -extent 2000x3000 `"$SeasonImage`""
                                Write-Host "    Resizing it... "
                                "    Resizing it... " | Out-File $global:ScriptRoot\Logs\PosterCreation.log  -Append
                                $logEntry = "magick.exe $Resizeargument"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                            }

                            # Move file back to original naming with Brackets.
                            Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                            $SeasonCount++
                        }
                    }
                }
                # Cleanup temp Poster
                if ($global:SeasonTempPoster -and (Test-Path $global:SeasonTempPoster -ErrorAction SilentlyContinue)) {
                    Remove-Item  $global:SeasonTempPoster -Force | out-null
                }
            }
            Else {
                Write-Host "Missing RootFolder for: $($entry.title) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) - you have to manually create the poster for it..." -ForegroundColor Red
                "Missing RootFolder for: $($entry.title) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) - you have to manually create the poster for it..." | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
            }
        }
        catch {
            <#Do this if a terminating exception happens#>
            $ErrorOutput = "Error for - Title: $($entry.RootFoldername) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) | $posterurl | Error Message: $_" 
            $ErrorOutput | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
        }
    }
    Write-Host "Finished, Total posters created: $posterCount | Total Season Posters created: $SeasonCount" -ForegroundColor Green
    Write-Host "    You can find all posters here: $AssetPath" -ForegroundColor Yellow
    "Finished, Total posters created: $posterCount | Total Season Posters created: $SeasonCount" | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
    "You can find all posters here: $AssetPath" | Out-File $global:ScriptRoot\Logs\Scriptlog.log  -Append
}
