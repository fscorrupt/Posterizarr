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

# Check if Config file is present
if (!(Test-Path "$PSScriptRoot\config.json")) {
    Write-Host "Config File missing, downloading it for you..."
    "Config File missing, downloading it for you..." | Out-File $TempPath\Scriptlog.log -Append 
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/blob/main/config.example.json" -OutFile "$PSScriptRoot\config.json"
    Write-Host "    Config File downloaded here: '$PSScriptRoot\config.json'"
    "Config File downloaded here: '$PSScriptRoot\config.json'" | Out-File $TempPath\Scriptlog.log -Append 
    
    Write-Host "    Please configure the config file according to GH, exit script now..." -ForegroundColor Yellow
    "Please configure the config file according to GH, exit script now..." | Out-File $TempPath\Scriptlog.log -Append 
    pause
    exit
}

# load config file
$config = Get-Content -Raw -Path "$PSScriptRoot\config.json" | ConvertFrom-Json

# Access variables from the config file
$tvdbapi = $config.tvdbapi
$tmdbtoken = $config.tmdbtoken
$FanartTvAPIKey = $config.FanartTvAPIKey
$LibstoExclude = $config.LibstoExclude
$TempPath = RemoveTrailingSlash $config.TempPath
$AssetPath = RemoveTrailingSlash $config.AssetPath
$font = "$TempPath\$($config.font)"
$overlay = "$TempPath\$($config.overlay)"
$magickinstalllocation = RemoveTrailingSlash $config.magickinstalllocation
$magick = "$magickinstalllocation\magick.exe"
$PlexToken = $config.PlexToken
$PlexUrl = $config.PlexUrl
$LibraryFolders = $config.LibraryFolders
$ImageProcessing = $config.ImageProcessing
$SeasonPosters = $config.SeasonPosters
$maxCharactersPerLine = 27 
$borderwidth = $config.borderwidth
$bordercolor = $config.bordercolor
$targetWidth = 1000 - ([int]$borderwidth*2)
$FontSize = $config.FontSize

if (!(Test-Path $TempPath)) {
    New-Item -ItemType Directory $TempPath -Force | out-null
}

# Test if files are present in Script root
if (!(Test-Path $overlay)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/blob/main/overlay.png" -OutFile $overlay 
}
if (!(Test-Path $font)) {
    Invoke-WebRequest -uri "https://github.com/fscorrupt/PosterMaker/blob/main/Rocky.ttf" -OutFile $font
}
if (!$Manual) {
    Write-Host "Cleanup old log file..."
    "Cleanup old log file..." | Out-File $TempPath\Scriptlog.log -Append
    # cleanup old logfile
    if ((Test-Path $TempPath\Scriptlog.log)) {
        Remove-Item $TempPath\Scriptlog.log
    }
}
if ($PlexToken) {
    Write-Host "Plex token found, checking access now..."
    "Plex token found, checking access now..." | Out-File $TempPath\Scriptlog.log -Append
    if ((Invoke-WebRequest "$PlexUrl/?X-Plex-Token=$PlexToken").StatusCode -eq 200) {
        Write-Host "    Plex access is working..." -ForegroundColor Green
        "Plex access is working..." | Out-File $TempPath\Scriptlog.log -Append
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
    "Checking Plex access now..." | Out-File $TempPath\Scriptlog.log -Append
    if ((Invoke-WebRequest "$PlexUrl").StatusCode -eq 200) {
        Write-Host "    Plex access is working..." -ForegroundColor Green
        "Plex access is working..." | Out-File $TempPath\Scriptlog.log -Append
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
    "ImageMagick missing, downloading/installing it for you..." | Out-File $TempPath\Scriptlog.log -Append
    $InstallArguments = "/verysilent /DIR=`"$magickinstalllocation`""
    Invoke-WebRequest https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -OutFile $TempPath\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
    Start-Process $TempPath\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -ArgumentList $InstallArguments -NoNewWindow -Wait
    Write-Host "    ImageMagick installed here: $magickinstalllocation" -ForegroundColor Green
    "ImageMagick installed here: $magickinstalllocation" | Out-File $TempPath\Scriptlog.log -Append
    Remove-Item $TempPath\ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe -Force | out-null
}
# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-Host "FanartTvAPI Module missing, installing it for you..." -ForegroundColor Red
    "FanartTvAPI Module missing, installing it for you..." | Out-File $TempPath\Scriptlog.log -Append
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber
    
    Write-Host "    FanartTvAPI Module installed, importing it now..." -ForegroundColor Green
    "FanartTvAPI Module installed, importing it now..." | Out-File $TempPath\Scriptlog.log -Append
    Import-Module -Name FanartTvAPI
}
# Add Fanart Api
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# tmdb Header
$headers = @{}
$headers.Add("accept", "application/json")
$headers.Add("Authorization", "Bearer $tmdbtoken")

# tvdb token Header
$apiUrl = "https://api4.thetvdb.com/v4/login"
$requestBody = @{
    apikey = $tvdbapi
} | ConvertTo-Json

# tvdb Header
$tvdbtokenheader = @{
    'accept'       = 'application/json'
    'Content-Type' = 'application/json'
}
# Make tvdb the POST request
$tvdbtoken = (Invoke-RestMethod -Uri $apiUrl -Headers $tvdbtokenheader -Method Post -Body $requestBody).data.token
$tvdbheader = @{}
$tvdbheader.Add("accept", "application/json")
$tvdbheader.Add("Authorization", "Bearer $tvdbtoken")

function Split-Title {
    param (
        [string]$title,
        [int]$maxCharactersPerLine
    )

    $titleLines = @()
    $currentLine = ""

    foreach ($word in $title -split '\s+') {
        if (($currentLine + ' ' + $word).Length -le $maxCharactersPerLine) {
            $currentLine += ' ' + $word
        }
        else {
            $titleLines += $currentLine.Trim()
            $currentLine = $word
        }
    }

    if ($currentLine -ne "") {
        $titleLines += $currentLine.Trim()
    }

    return $titleLines -join "`n"
}

if ($Manual) {
    cls
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
                $seasonNumber = $Matches[1]
                $season = "Season" + $seasonNumber.PadLeft(2, '0')
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
                $seasonNumber = $Matches[1]
                $season = "Season" + $seasonNumber.PadLeft(2, '0')
            }
            if ($season -eq 'Specials') {
                $season = "Season00"
            }  
            $backgroundImageoriginal = "$AssetPath\$($FolderName)_$season.jpg"
        }
    }

    $backgroundImage = "$TempPath\$FolderName.jpg"
    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    if ($ImageProcessing -eq 'true') {
        Write-Host "Creating poster now..." -ForegroundColor Cyan
        if ($CreateSeasonPoster -eq 'y') {
            $joinedTitle = $SeasonPosterName
        }
        Else {
            if ($Titletext.Length -gt $maxCharactersPerLine ) {
                $joinedTitle = Split-Title -title $Titletext -maxCharactersPerLine $maxCharactersPerLine
            }
            Else {
                $joinedTitle = $Titletext
            }
        }
        Move-Item -LiteralPath $PicturePath -destination $backgroundImage -Force -ErrorAction SilentlyContinue
    
        # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
        [int]$currentWidth = & $magick identify -format '%w' "$backgroundImage"
        [int]$currentHeight = & $magick identify -format '%h' "$backgroundImage"
        $targetHeight = [math]::Round(($targetWidth / $currentWidth) * $currentHeight)

        if ($currentWidth -lt $targetWidth) {
            # Resize the final image to maintain the aspect ratio with a width of 1000 pixels
            $resizeFinalArguments = "convert `"$backgroundImage`" -resize ${targetWidth}x${targetHeight} `"$backgroundImage`""
            Start-Process $magick -Wait -NoNewWindow -ArgumentList $resizeFinalArguments
        }

        $Arguments = "convert `"$backgroundImage`" `"$overlay`" -geometry +0+450 -composite -bordercolor white -border 15 -font `"$font`" -fill white -pointsize 50 -gravity center -draw `"text 0,530 '$joinedTitle '`" `"$backgroundImage`""
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
    }
    # Move file back to original naming with Brackets.
    Move-Item -LiteralPath $backgroundImage -destination $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
    Write-Host "Poster created and moved to: $backgroundImageoriginal" -ForegroundColor Green
}
else {
    Write-Host "Query plex libs..." -ForegroundColor Cyan
    "Query plex libs..." | Out-File $TempPath\Scriptlog.log -Append
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
    "Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..." | Out-File $TempPath\Scriptlog.log -Append
    # Create Folder structure
    if (!(Test-Path $TempPath\assets)) {
        New-Item -ItemType Directory "$TempPath\assets" -Force | Out-Null
    }
    Write-Host "Query all items from all Libs, this can take a while..." -ForegroundColor Yellow
    "Query all items from all Libs, this can take a while..." | Out-File $TempPath\Scriptlog.log -Append
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
                $temp | Add-Member -MemberType NoteProperty -Name "title" -Value $item.title
                $temp | Add-Member -MemberType NoteProperty -Name "originalTitle" -Value $item.originalTitle
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
    "Found '$($Libraries.count)' Items..."  | Out-File $TempPath\Scriptlog.log -Append
    $Libraries | Select-Object * | Export-Csv -Path "$TempPath\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
    Write-Host "Export everything to a csv: $TempPath\PlexLibexport.csv"
    "Export everything to a csv: $TempPath\PlexLibexport.csv" | Out-File $TempPath\Scriptlog.log -Append
    # Download poster foreach movie
    Write-Host "Starting poster creation now, this can take a while..." -ForegroundColor Yellow
    "Starting poster creation now, this can take a while..." | Out-File $TempPath\Scriptlog.log -Append
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
                        New-Item -ItemType Directory $EntryDir -Force | out-null
                    }
                }
                Else {
                    $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                }

                $backgroundImage = "$TempPath\$($entry.RootFoldername).jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                if (!(Get-ChildItem -LiteralPath $backgroundImageoriginal -ErrorAction SilentlyContinue)) {
                    if ($entry.'Library Type' -eq 'movie') {
                        $posterurl = $null
                        If ($entry.tmdbid) { 
                            $entrytemp = Get-FanartTv -Type movies -id $entry.tmdbid -ErrorAction SilentlyContinue
                            # nothing found via fanart.tv - try tmdb now
                            if (!($entrytemp) -or !($entrytemp.movieposter)) {
                                try {
                                    $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
                                }
                                catch {
                                }
                                if ($response) {
                                    if ($response.images.posters) {
                                        $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                        if (!$NoLangPoster) {
                                            $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                        Else {
                                            $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                    }
                                }
                                Else {
                                    # nothing found via tmbd - try imdb as last attempt
                                    $response = Invoke-WebRequest -Uri "https://www.imdb.com/title/$($entry.imdb)/mediaviewer" -Method GET
                                    $posterurl = $response.images.src[1]
                                }
                            }
                            Else {
                                if (!($entrytemp.movieposter | where lang -eq '00')) {
                                    try {
                                        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
                                    }
                                    catch {
                                    }
                                    if ($response) {
                                        if ($response.images.posters) {
                                            $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                            if (!$NoLangPoster) {
                                                $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                                $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                            }
                                            Else {
                                                $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                                $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                            }
                                        }
                                        Else {
                                            $posterurl = ($entrytemp.movieposter)[0].url
                                        }
                                    }
                                    Else {
                                        $posterurl = ($entrytemp.movieposter)[0].url
                                    }
                                }
                                Else {
                                    $posterurl = ($entrytemp.movieposter | where lang -eq '00')[0].url
                                }
                            }
                        }
                        Else { 
                            $entrytemp = Get-FanartTv -Type movies -id $entry.imdbid -ErrorAction SilentlyContinue
            
                            if (!($entrytemp) -or !($entrytemp.movieposter)) {
                                try {
                                    $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($entry.imdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers).content | ConvertFrom-Json    
                                }
                                catch {
                                }
                                if ($response) {
                                    if ($response.images.posters) {
                                        $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                        if (!$NoLangPoster) {
                                            $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                        Else {
                                            $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                    }
                                }
                            }
                            Else {
                                if (!($entrytemp.movieposter | where lang -eq '00')) {
                                    $posterurl = ($entrytemp.movieposter)[0].url
                                }
                                Else {
                                    $posterurl = ($entrytemp.movieposter | where lang -eq '00')[0].url
                                }
                            }
                        }
                    }
                    if ($entry.'Library Type' -eq 'show') {
                        $posterurl = $null
                        $entrytemp = Get-FanartTv -Type tv -id $entry.tvdbid -ErrorAction SilentlyContinue
            
                        if (!($entrytemp) -or !($entrytemp.tvposter)) {
                            if ($entry.tmdbid) {
                                try {
                                    $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers).content | ConvertFrom-Json
                                }
                                catch {
                                }
                                if ($response) {
                                    if ($response.images.posters) {
                                        $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                        if (!$NoLangPoster) {
                                            $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                        Else {
                                            $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                    }
                                }
                                Else {
                                    $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($entry.tvdbid)" -Method GET -Headers $tvdbheader).content | ConvertFrom-Json
                                    $posterurl = $response.data.image
                                }
                            }
                            Else {
                                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($entry.tvdbid)" -Method GET -Headers $tvdbheader).content | ConvertFrom-Json
                                $posterurl = $response.data.image
                            }
                        }
                        Else {
                            if (!($entrytemp.tvposter | where lang -eq '00')) {
                                if ($entry.tmdbid) {
                                    try {
                                        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers).content | ConvertFrom-Json
                                    }
                                    catch {
                                    }
                                    if ($response) {
                                        if ($response.images.posters) {
                                            $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                            if (!$NoLangPoster) {
                                                $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                                $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                            }
                                            Else {
                                                $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                                $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                            }
                                        }
                                    }
                                    Else {
                                        $posterurl = ($entrytemp.tvposter)[0].url
                                    }
                                }
                                Else {
                                    $posterurl = ($entrytemp.tvposter)[0].url
                                }
                            }
                            Else {
                                $posterurl = ($entrytemp.tvposter | where lang -eq '00')[0].url
                            }
                        }

                    }

                    if ($Titletext.Length -gt $maxCharactersPerLine ) {
                        $joinedTitle = Split-Title -title $Titletext -maxCharactersPerLine $maxCharactersPerLine
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    Invoke-WebRequest -Uri $posterurl -OutFile $backgroundImage
                    if ($ImageProcessing -eq 'true') {
                        # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                        [int]$currentWidth = & $magick identify -format '%w' "$backgroundImage"
                        [int]$currentHeight = & $magick identify -format '%h' "$backgroundImage"
                        $targetHeight = [math]::Round(($targetWidth / $currentWidth) * $currentHeight)

                        if ($currentWidth -ne $targetWidth) {
                            # Resize the final image to maintain the aspect ratio with a width of 1000 pixels
                            $resizeFinalArguments = "convert `"$backgroundImage`" -resize ${targetWidth}x${targetHeight} `"$backgroundImage`""
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $resizeFinalArguments
                        }

                        $Arguments = "convert `"$backgroundImage`" `"$overlay`" -geometry +0+450 -composite -bordercolor `"$bordercolor`" -border `"$borderwidth`" -font `"$font`" -fill white -pointsize `"$FontSize`" -gravity center -draw `"text 0,530 \""$joinedTitle\"" `" `"$backgroundImage`""
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                    }
                    # Move file back to original naming with Brackets.
                    Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                    $posterCount++
                }
                # Create Season Posters
                if ($SeasonPosters -eq 'true' -and $entry.'Library Type' -eq 'show') {
                    $posterurl = $null
                    $ismissing = $null
                    if (!($entry.tvdbid)) {
                        Write-Host "TVDBID missing for: $($entry.title)" -ForegroundColor Red
                        "TVDBID missing for: $($entry.title)" | Out-File $TempPath\Scriptlog.log -Append
                    }
                    Else {
                        $entrytemp = Get-FanartTv -Type tv -id $entry.tvdbid -ErrorAction SilentlyContinue
            
                        if (!($entrytemp) -or !($entrytemp.tvposter)) {
                            if ($entry.tmdbid) {
                                try {
                                    $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers).content | ConvertFrom-Json
                                }
                                catch {
                                }
                                if ($response) {
                                    if ($response.images.posters) {
                                        $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                        if (!$NoLangPoster) {
                                            $posterpath = (($response.images.posters | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                        Else {
                                            $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                            $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                        }
                                    }
                                }
                                else {
                                    $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($entry.tvdbid)" -Method GET -Headers $tvdbheader).content | ConvertFrom-Json
                                    $posterurl = $response.data.image
                                }
                            }
                            Else {
                                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($entry.tvdbid)" -Method GET -Headers $tvdbheader).content | ConvertFrom-Json
                                $posterurl = $response.data.image
                            }
                        }
                        Else {
                            if (!($entrytemp.tvposter | where lang -eq '00')) {
                                if ($entry.tmdbid) {
                                    try {
                                        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($entry.tmdbid)?append_to_response=images&language=xx&include_image_language=en,null" -Method GET -Headers $headers).content | ConvertFrom-Json
                                    }
                                    catch {
                                    }
                                    if ($response) {
                                        if ($response.images.posters) {
                                            $NoLangPoster = ($response.images.posters | where iso_639_1 -eq $null)
                                            if (!$NoLangPoster) {
                                                $posterurl = ($entrytemp.tvposter)[0].url
                                            }
                                            Else {
                                                $posterpath = (($response.images.posters | where iso_639_1 -eq $null | Sort-Object vote_count -Descending)[0]).file_path
                                                $posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                                            }
                                        }
                                    }
                                    Else {
                                        $posterurl = ($entrytemp.tvposter)[0].url
                                    }
                                }
                                Else {
                                    $posterurl = ($entrytemp.tvposter)[0].url
                                }
                            }
                            Else {
                                $posterurl = ($entrytemp.tvposter | where lang -eq '00')[0].url
                            }
                        }
                        #Temp download
                        $SeasonTempPoster = "$TempPath\SeasonTemp.jpg"
                        if ((Get-ChildItem -LiteralPath $SeasonTempPoster -ErrorAction SilentlyContinue)) {
                            Remove-Item  $SeasonTempPoster -Force | out-null
                        }
                        Function Downloadtempifmissing {
                            if ($ismissing) {
                                if ($posterurl){
                                    Invoke-WebRequest -Uri $posterurl -OutFile $SeasonTempPoster
                                }Else {
                                    Write-Host "No Poster Url found for: $($entry.title) - Please manually Create Posters..." -ForegroundColor Red
                                    "No Poster Url found for: $($entry.title) - Please manually Create Posters..." | Out-File $TempPath\Scriptlog.log -Append
                                }
                            }
                        }

                        $seasonNames = $entry.SeasonNames -split ','
                        foreach ($season in $seasonNames) {
                            $seasonTitle = $season
                            if ($season -match 'Season\s+(\d+)') {
                                $seasonNumber = $Matches[1]
                                $season = "Season" + $seasonNumber.PadLeft(2, '0')
                            }
                            if ($season -eq 'Specials') {
                                $season = "Season00"
                            }    
                            if ($LibraryFolders -eq 'true') {
                                $SeasonImageoriginal = "$EntryDir\$season.jpg"
                            }
                            Else {
                                $SeasonImageoriginal = "$AssetPath\$($entry.RootFoldername)_$season.jpg"
                            }
                            $SeasonImage = "$TempPath\$($entry.RootFoldername)_$season.jpg"
                            $SeasonImage = $SeasonImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                            if (!(Get-ChildItem -LiteralPath $SeasonImageoriginal -ErrorAction SilentlyContinue)) {
                                $ismissing = $true
                                if ($ImageProcessing -eq 'true') {
                                    if (!(Get-ChildItem -LiteralPath $SeasonTempPoster -ErrorAction SilentlyContinue)) {
                                        Downloadtempifmissing
                                    }
                                    Copy-Item -LiteralPath $SeasonTempPoster $SeasonImage -Force | out-null
                                    # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                    [int]$currentWidth = & $magick identify -format '%w' "$SeasonImage"
                                    [int]$currentHeight = & $magick identify -format '%h' "$SeasonImage"
                                    $targetHeight = [math]::Round(($targetWidth / $currentWidth) * $currentHeight)
                                
                                    if ($currentWidth -ne $targetWidth) {
                                        # Resize the final image to maintain the aspect ratio with a width of 1000 pixels
                                        $resizeFinalArguments = "convert `"$SeasonImage`" -resize ${targetWidth}x${targetHeight} `"$SeasonImage`""
                                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $resizeFinalArguments
                                    }
                                
                                    $Arguments = "convert `"$SeasonImage`" `"$overlay`" -geometry +0+450 -composite -bordercolor `"$bordercolor`" -border `"$borderwidth`" -font `"$font`" -fill white -pointsize `"$FontSize`" -gravity center -draw `"text 0,530 \""$seasonTitle\"" `" `"$SeasonImage`""
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                }
                                Else {
                                    # Get Season poster from fanart, fallback to poster if missing
                                    if ($posterurl){
                                        $fallbackurl = $posterurl
                                    }
                                    $entrytemp = Get-FanartTv -Type tv -id $entry.tvdbid 
                                    if ($entrytemp.seasonposter){
                                        if ($season -eq 'Season00'){
                                            $seasonNumber = 0
                                        }
                                        $posterurl = ($entrytemp.seasonposter | where {$_.lang -eq 'en' -and $_.Season -eq $seasonNumber} | Sort-Object likes)[0].url
                                        Invoke-WebRequest -Uri $posterurl -OutFile $SeasonImage
                                    }
                                    Else {
                                        Invoke-WebRequest -Uri $fallbackurl -OutFile $SeasonImage
                                    }
                                }
                                # Move file back to original naming with Brackets.
                                Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                                $SeasonCount++
                            }
                        }
                    }
                }
                # Cleanup temp Poster
                if ($SeasonTempPoster -and (Test-Path $SeasonTempPoster -ErrorAction SilentlyContinue)) {
                    Remove-Item  $SeasonTempPoster -Force | out-null
                }
            }
            Else {
                Write-Host "Missing RootFolder for: $($entry.title) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) - you have to manually create the poster for it..." -ForegroundColor Red
                "Missing RootFolder for: $($entry.title) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) - you have to manually create the poster for it..." | Out-File $TempPath\Scriptlog.log -Append
            }
        }
        catch {
            <#Do this if a terminating exception happens#>
            $ErrorOutput = "Error for - Title: $($entry.RootFoldername) | tvdbid: $($entry.tvdbid) | imdbid: $($entry.imdbid) | tmdbid: $($entry.tmdbid) | $posterurl | Error Message: $_" 
            $ErrorOutput | Out-File $TempPath\Scriptlog.log -Append
        }
    }
    Write-Host "Finished, Total posters created: $posterCount | Total Season Posters created: $SeasonCount" -ForegroundColor Green
    Write-Host "    You can find all posters here: $AssetPath" -ForegroundColor Yellow
    "Finished, Total posters created: $posterCount | Total Season Posters created: $SeasonCount" | Out-File $TempPath\Scriptlog.log -Append
    "You can find all posters here: $AssetPath" | Out-File $TempPath\Scriptlog.log -Append
}