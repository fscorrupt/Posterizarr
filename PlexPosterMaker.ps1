param (
    [switch]$Manual,
    [switch]$Testing
)

$CurrentScriptVersion = "1.0.70"
$global:HeaderWritten = $false
$ProgressPreference = 'SilentlyContinue'

#################
# What you need #
#####################################################################################################################
# TMDB API Read Access Token      -> https://www.themoviedb.org/settings/api
# FANART API                      -> https://fanart.tv/get-an-api-key
# TVDB API                        -> https://thetvdb.com/api-information/signup
# ImageMagick                     -> https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
# FanartTv API Powershell Wrapper -> https://github.com/Celerium/FanartTV-PowerShellWrapper
#####################################################################################################################
function Set-OSTypeAndScriptRoot {
    if ($env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
        $global:OSType = "DockerAlpine"
        $global:ScriptRoot = "./config"
    }
    Else {
        $global:ScriptRoot = $PSScriptRoot
        $global:OSType = [System.Environment]::OSVersion.Platform
    }
}
function Write-Entry {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Info', 'Warning', 'Error', 'Optional', 'Debug', 'Trace', 'Success')]
        [string]$log,

        [Parameter(Mandatory = $true)]
        [ValidateSet('White', 'Yellow', 'Red', 'Blue', 'DarkMagenta', 'Cyan', 'Green')]
        [string]$Color,

        [string]$Subtext = $null
    )
    switch ($log) {
        'Info' { $theLog = 2 }
        'Warning' { $theLog = 1 }
        'Error' { $theLog = 1 }
        'Debug' { $theLog = 3 }
        'Optional' { $theLog = 3 }
    }
    if (!(Test-Path -path $path)) {
        New-Item -Path $Path -Force | out-null
    }
    # ASCII art header
    if (-not $global:HeaderWritten) {
        $Header = @"
===============================================================================
  ____  _             ____           _              __  __       _
 |  _ \| | _____  __ |  _ \ ___  ___| |_ ___ _ __  |  \/  | __ _| | _____ _ __
 | |_) | |/ _ \ \/ / | |_) / _ \/ __| __/ _ \ '__| | |\/| |/ _``` | |/ / _ \ '__|
 |  __/| |  __/>  <  |  __/ (_) \__ \ ||  __/ |    | |  | | (_| |   <  __/ |
 |_|   |_|\___/_/\_\ |_|   \___/|___/\__\___|_|    |_|  |_|\__,_|_|\_\___|_|

 Current Version: $CurrentScriptVersion
 Latest Version: $LatestScriptVersion
 Platform: $Platform
===============================================================================
"@
        Write-Host $Header
        $Header | Out-File $Path -Append
        $global:HeaderWritten = $true
    }
    if ($theLog -le $global:logLevel) {
        $Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        $PaddedType = "[" + $log + "]"
        $PaddedType = $PaddedType.PadRight(10)
        $Linenumber = "L" + "." + "$($MyInvocation.ScriptLineNumber)"
        if ($Linenumber.Length -eq '5') {
            $Linenumber = $Linenumber + " "
        }
        $TypeFormatted = "[{0}] {1}|{2}" -f $Timestamp, $PaddedType.ToUpper(), $Linenumber

        if ($Message) {
            $FormattedLine1 = "{0}| {1}" -f ($TypeFormatted, $Message)
            $FormattedLineWritehost = "{0}| " -f ($TypeFormatted)
        }

        if ($Subtext) {
            $FormattedLine = "{0}|      {1}" -f ($TypeFormatted, $Subtext)
            $FormattedLineWritehost = "{0}|      " -f ($TypeFormatted)
            Write-Host $FormattedLineWritehost -NoNewline
            Write-Host $Subtext -ForegroundColor $Color
            $FormattedLine | Out-File $Path -Append
        }
        else {

            Write-Host $FormattedLineWritehost -NoNewline
            Write-Host $Message -ForegroundColor $Color
            $FormattedLine1 | Out-File $Path -Append
        }
    }
}
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
function Get-OptimalPointSize {
    param(
        [string]$text,
        [string]$fontImagemagick,
        [int]$box_width,
        [int]$box_height,
        [int]$min_pointsize,
        [int]$max_pointsize
    )
    # stolen and adapted from: https://github.com/bullmoose20/Plex-Stuff/blob/9d231d871a4676c8da7d4cbab482181a35756524/create_defaults/create_default_posters.ps1#L477
    $global:IsTruncated = $null
    # Construct the command with correct font option
    $cmd = "& `"$magick`" -size ${box_width}x${box_height} -font `"$fontImagemagick`" -gravity center -fill black caption:`"$text`" -format `"%[caption:pointsize]`" info:"
    $cmd | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
    # Execute command and get point size
    $current_pointsize = [int](Invoke-Expression $cmd | Out-String).Trim()
    # Apply point size limits
    if ($current_pointsize -gt $max_pointsize) {
        $current_pointsize = $max_pointsize
    }
    elseif ($current_pointsize -lt $min_pointsize) {
        Write-Entry -Subtext "Text truncated! optimalFontSize: $current_pointsize below min_pointsize: $min_pointsize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        $global:IsTruncated = $true
        $current_pointsize = $min_pointsize
    }

    # Return optimal point size
    return $current_pointsize
}
function GetTMDBMoviePoster {
    Write-Entry -Subtext "Searching on TMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
            $errorCount++
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    if (!$global:OnlyTextless) {
                        $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($global:FavProvider -eq 'TMDB') {
                            $global:Fallback = "fanart"
                            $global:tmdbfallbackposterurl = $global:posterurl
                        }
                        Write-Entry -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:PosterWithText = $true
                        $global:TMDBAssetTextLang = (($response.images.posters | Sort-Object vote_average -Descending)[0]).iso_639_1
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
                    }
                    Else {
                        Write-Entry -Subtext "Found Poster with text on TMDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
                    }
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=$($PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
            $errorCount++
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/posters"
        }
    }
}
function GetTMDBMovieBackground {
    Write-Entry -Subtext "Searching on TMDB for a movie background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
            $errorCount++
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    if (!$global:OnlyTextless) {
                        $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($global:FavProvider -eq 'TMDB') {
                            $global:Fallback = "fanart"
                            $global:tmdbfallbackposterurl = $global:posterurl
                        }
                        Write-Entry -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:PosterWithText = $true
                        $global:TMDBAssetTextLang = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).iso_639_1
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                    }
                    Else {
                        Write-Entry -Subtext "Found Poster with text on TMDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                    }
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=$($PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
            $errorCount++
        }
        if ($response) {
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/movie/$($global:tmdbid)/images/backdrops"
        }
    }
}
function GetTMDBShowPoster {
    Write-Entry -Subtext "Searching on TMDB for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
            $errorCount++
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    if (!$global:OnlyTextless) {
                        $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($global:FavProvider -eq 'TMDB') {
                            $global:Fallback = "fanart"
                            $global:tmdbfallbackposterurl = $global:posterurl
                        }
                        Write-Entry -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:PosterWithText = $true
                        $global:TMDBAssetTextLang = (($response.images.posters | Sort-Object vote_average -Descending)[0]).iso_639_1
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
                        return $global:posterurl
                    }
                    Else {
                        Write-Entry -Subtext "Found Poster with text on TMDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
                    }
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
            $errorCount++
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/posters"
        }
    }
}
function GetTMDBSeasonPoster {
    Write-Entry -Subtext "Searching on TMDB for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
            $errorCount++
        }
        if ($response) {
            if ($response.posters) {
                $NoLangPoster = ($response.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    if (!$global:OnlyTextless) {
                        $posterpath = (($response.posters | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:PosterWithText = $true
                        $global:TMDBAssetTextLang = (($response.posters | Sort-Object vote_average -Descending)[0]).iso_639_1
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
                        $global:TMDBSeasonFallback = $global:posterurl
                        return $global:posterurl
                    }
                    Else {
                        Write-Entry -Subtext "Found Poster with text on TMDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
                    }
                }
                Else {
                    $posterpath = (($response.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
            }
        }
        Else {
            Write-Entry -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
        }
    }
    Else {
        try {
            if ($global:SeasonNumber -match '\b\d{1,2}\b') {
                $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=$($global:PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
            Else {
                $responseBackup = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
            $errorCount++
        }
        if ($responseBackup) {
            if ($responseBackup.images.posters) {
                Write-Entry -Subtext "Could not get a result with '$global:SeasonNumber' on TMDB, likely season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($responseBackup.images.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($responseBackup.images.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        if ($response) {
            if ($response.posters) {
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.posters | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.posters | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
            Else {
                Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
            }
        }
        Else {
            Write-Entry -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:SeasonNumber/images/posters"
        }

    }
}
function GetTMDBShowBackground {
    Write-Entry -Subtext "Searching on TMDB for a show background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
            $errorCount++
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    if (!$global:OnlyTextless) {
                        $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($global:FavProvider -eq 'TMDB') {
                            $global:Fallback = "fanart"
                            $global:tmdbfallbackposterurl = $global:posterurl
                        }
                        Write-Entry -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:PosterWithText = $true
                        $global:TMDBAssetTextLang = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).iso_639_1
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                    }
                    Else {
                        Write-Entry -Subtext "Found Poster with text on TMDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                    }
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Entry -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                        return $global:posterurl
                    }
                }
                if (!$global:posterurl) {
                    Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferredLanguageOrder[0])&include_image_language=$($global:PreferredLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
            Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
            $errorCount++
        }
        if ($response) {
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferredLanguageOrderTMDB) {
                    if ($lang -eq 'null') {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                    }
                    Else {
                        $FavPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $lang)
                    }
                    if ($FavPoster) {
                        $posterpath = (($FavPoster | Sort-Object vote_average -Descending)[0]).file_path
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        if ($lang -eq 'null') {
                            Write-Entry -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                            $global:TMDBAssetTextLang = $lang
                            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Entry -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/images/backdrops"
        }
    }
}
function GetTMDBTitleCard {
    Write-Entry -Subtext "Searching on TMDB for: $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    try {
        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$($global:season_number)/episode/$($global:episodenumber)/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
    }
    catch {
        Write-Entry -Subtext "Could not query TMDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:season_number/episode/$global:episodenumber/images/backdrops"
        $errorCount++
    }
    if ($response) {
        if ($response.stills) {
            $NoLangPoster = ($response.stills | Where-Object iso_639_1 -eq $null)
            if (!$NoLangPoster) {
                $posterpath = (($response.stills | Sort-Object vote_average -Descending)[0]).file_path
                $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                Write-Entry -Subtext "Found Title Card with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                $global:PosterWithText = $true
                $global:TMDBAssetTextLang = (($response.stills | Sort-Object vote_average -Descending)[0]).iso_639_1
                $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:season_number/episode/$global:episodenumber/images/backdrops"
                return $global:posterurl
            }
            Else {
                $posterpath = (($response.stills | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                if ($posterpath) {
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-Entry -Subtext "Found Textless Title Card on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                    $global:TextlessPoster = $true
                    $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:season_number/episode/$global:episodenumber/images/backdrops"
                    return $global:posterurl
                }
            }
        }
        Else {
            Write-Entry -Subtext "No Title Card found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:season_number/episode/$global:episodenumber/images/backdrops"
            $global:Fallback = "TVDB"
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
        }
    }
    Else {
        Write-Entry -Subtext "TMDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        $global:TMDBAssetChangeUrl = "https://www.themoviedb.org/tv/$($global:tmdbid)/season/$global:season_number/episode/$global:episodenumber/images/backdrops"
        $global:Fallback = "TVDB"
        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        $errorCount++
    }
}
function GetFanartMoviePoster {
    $global:Fallback = $null
    Write-Entry -Subtext "Searching on Fanart.tv for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    if (!($entrytemp.movieposter | Where-Object lang -eq '00')) {
                        if (!$global:OnlyTextless) {
                            $global:posterurl = ($entrytemp.movieposter)[0].url
                            Write-Entry -Subtext "Found Poster with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            $global:PosterWithText = $true
                            $global:FANARTAssetTextLang = ($entrytemp.movieposter)[0].lang
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"

                            if ($global:FavProvider -eq 'FANART') {
                                $global:Fallback = "TMDB"
                                $global:fanartfallbackposterurl = ($entrytemp.movieposter)[0].url
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with text on FANART, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.movieposter | Where-Object lang -eq '00')[0].url
                        Write-Entry -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-Entry -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
    Else {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    foreach ($lang in $global:PreferredLanguageOrderFanart) {
                        if (($entrytemp.movieposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.movieposter)[0].url
                            if ($lang -eq '00') {
                                Write-Entry -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                                $global:FANARTAssetTextLang = $lang
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-Entry -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartMovieBackground {
    $global:Fallback = $null
    Write-Entry -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null

    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.moviebackground) {
                if (!($entrytemp.moviebackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.moviebackground)[0].url
                    Write-Entry -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                    $global:PosterWithText = $true
                    $global:FANARTAssetTextLang = ($entrytemp.moviebackground)[0].lang
                    $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"

                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.moviebackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.moviebackground | Where-Object lang -eq '')[0].url
                    Write-Entry -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                    $global:TextlessPoster = $true
                    $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"
                    break
                }
            }
        }
    }
    if (!$global:posterurl) {
        Write-Entry -Subtext "No movie match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
    }

}
function GetFanartShowPoster {
    $global:Fallback = $null
    Write-Entry -Subtext "Searching on Fanart.tv for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    if (!($entrytemp.tvposter | Where-Object lang -eq '00')) {
                        if (!$global:OnlyTextless) {
                            $global:posterurl = ($entrytemp.tvposter)[0].url

                            Write-Entry -Subtext "Found Poster with text on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            $global:PosterWithText = $true
                            $global:FANARTAssetTextLang = ($entrytemp.tvposter)[0].lang
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"

                            if ($global:FavProvider -eq 'FANART') {
                                $global:Fallback = "TMDB"
                                $global:fanartfallbackposterurl = ($entrytemp.tvposter)[0].url
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with text on FANART, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.tvposter | Where-Object lang -eq '00')[0].url
                        Write-Entry -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                        $global:TextlessPoster = $true
                        $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-Entry -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning

            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
    Else {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    foreach ($lang in $global:PreferredLanguageOrderFanart) {
                        if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.tvposter)[0].url
                            if ($lang -eq '00') {
                                Write-Entry -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                                $global:FANARTAssetTextLang = $lang
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-Entry -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning

            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartShowBackground {
    $global:Fallback = $null
    Write-Entry -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null

    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.showbackground) {
                if (!($entrytemp.showbackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.showbackground)[0].url
                    Write-Entry -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                    $global:PosterWithText = $true
                    $global:FANARTAssetTextLang = ($entrytemp.showbackground)[0].lang
                    $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"

                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.showbackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.showbackground | Where-Object lang -eq '')[0].url
                    Write-Entry -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                    $global:TextlessPoster = $true
                    $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                    break
                }
            }
        }
    }

    if (!$global:posterurl) {
        Write-Entry -Subtext "No show match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
    }

}
function GetFanartSeasonPoster {
    Write-Entry -Subtext "Searching on Fanart.tv for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
    if ($global:PreferTextless -eq 'True') {
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp.seasonposter) {
                    if ($global:SeasonNumber -match '\b\d{1,2}\b') {
                        $NoLangPoster = ($entrytemp.seasonposter | Where-Object { $_.lang -eq '00' -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)
                        if ($NoLangPoster) {
                            $global:posterurl = ($NoLangPoster | Sort-Object likes)[0].url
                            Write-Entry -Subtext "Found Season Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            $global:TextlessPoster = $true
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                        }
                        Else {
                            if (!$global:OnlyTextless) {
                                Write-Entry -Subtext "No Texless Season Poster on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                foreach ($lang in $global:PreferredLanguageOrderFanart) {
                                    $FoundPoster = ($entrytemp.seasonposter | Where-Object { $_.lang -eq "$lang" -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)
                                    if ($FoundPoster) {
                                        $global:posterurl = $FoundPoster[0].url
                                        Write-Entry -Subtext "Found season Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                        $global:PosterWithText = $true
                                        $global:FANARTAssetTextLang = $lang
                                        $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                                        break
                                    }
                                }
                            }
                            Else {
                                Write-Entry -Subtext "Found Poster with text on FANART, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                                $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                            }
                        }
                    }
                    Else {
                        Write-Entry -Subtext "Could not get a result with '$global:SeasonNumber' on Fanart, likely season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        if ($entrytemp -and $entrytemp.tvposter) {
                            foreach ($lang in $global:PreferredLanguageOrderFanart) {
                                if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                                    $global:posterurl = ($entrytemp.tvposter)[0].url
                                    if ($lang -eq '00') {
                                        Write-Entry -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                        $global:TextlessPoster = $true
                                        $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                                    }
                                    Else {
                                        if (!$global:OnlyTextless) {
                                            Write-Entry -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                        }
                                    }
                                    if (!$global:OnlyTextless -and !$global:TextlessPoster) {
                                        if ($lang -ne '00') {
                                            $global:PosterWithText = $true
                                            $global:FANARTAssetTextLang = $lang
                                            $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                                        }
                                    }
                                    Else {
                                        Write-Entry -Subtext "Found Poster with text on FANART, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                                        $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                                        $global:posterurl = $null
                                    }
                                    break
                                }
                            }
                        }
                    }
                    break
                }
                Else {
                    $global:posterurl = $null
                    break
                }
            }
        }
        if ($global:posterurl) {
            Write-Entry -Subtext "Found season poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
            return $global:posterurl
        }
        Else {
            Write-Entry -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        }
    }
    Else {
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp.seasonposter) {
                    foreach ($lang in $global:PreferredLanguageOrderFanart) {
                        $FoundPoster = ($entrytemp.seasonposter | Where-Object { $_.lang -eq "$lang" -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)
                        if ($FoundPoster) {
                            $global:posterurl = $FoundPoster[0].url
                        }
                        if ($global:posterurl) {
                            if ($lang -eq '00') {
                                Write-Entry -Subtext "Found season Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                $global:TextlessPoster = $true
                                $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                            }
                            Else {
                                Write-Entry -Subtext "Found season Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                $global:PosterWithText = $true
                                $global:FANARTAssetTextLang = $lang
                                $global:FANARTAssetChangeUrl = "https://fanart.tv/series/$id"
                                break
                            }
                        }
                    }
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
            Write-Entry -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        }
    }
}
function GetTVDBMoviePoster {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-Entry -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurltmp = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '14' } | Sort-Object Score)
                    
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                    if ($global:posterurltmp) {
                        $global:posterurl = $global:posterurltmp[0].image
                        Write-Entry -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        return $global:posterurl
                    }
                    Else {
                        if (!$global:OnlyTextless) {
                            foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                                if ($lang -eq 'null') {
                                    $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '14' } | Sort-Object Score)
                                }
                                Else {
                                    $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '14' } | Sort-Object Score)
                                }
                                if ($LangArtwork) {
                                    $global:posterurl = $LangArtwork[0].image
                                    if ($lang -eq 'null') {
                                        Write-Entry -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                    }
                                    Else {
                                        Write-Entry -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                    }
                                    if ($lang -ne 'null') {
                                        $global:PosterWithText = $true
                                        $global:TVDBAssetTextLang = $lang
                                    }
                                    return $global:posterurl
                                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                                    break
                                }
                            }
                        }
                        Else {
                            Write-Entry -Subtext "No Textless Poster on FANART, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            $global:FANARTAssetChangeUrl = "https://fanart.tv/movie/$id"
                        }
                    }
                }
                Else {
                    Write-Entry -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
            }
        }
        Else {
            Write-Entry -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Entry -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                                $global:TVDBAssetTextLang = $lang
                            }
                            return $global:posterurl
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                            break
                        }
                    }
                }
                Else {
                    Write-Entry -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
            }
        }
    }
}
function GetTVDBMovieBackground {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-Entry -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurl = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '15' } | Sort-Object Score)[0].image
                    Write-Entry -Subtext "Found Textless Background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                    return $global:posterurl
                }
                Else {
                    Write-Entry -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
            }
        }
        Else {
            Write-Entry -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Entry -Subtext "Found Background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found Background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                                $global:TVDBAssetTextLang = $lang
                            }
                            return $global:posterurl
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-Entry -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                        $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                    }
                }
                Else {
                    Write-Entry -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/movies/$($response.data.slug)#artwork"
            }
        }
    }
}
function GetTVDBShowPoster {
    if ($global:tvdbid) {
        Write-Entry -Subtext "Searching on TVDB for a poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '2' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-Entry -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:TextlessPoster = $true
                        $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                    }
                    Else {
                        if (!$global:OnlyTextless) {
                            $global:posterurl = $defaultImageurl
                            Write-Entry -Subtext "Found Poster with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with text on TVDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                        }
                    }
                    return $global:posterurl
                }
                Else {
                    Write-Entry -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
            }
        }
        Else {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data) {
                    foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '2' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '2' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Entry -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                                $global:TVDBAssetTextLang = $lang
                            }
                            return $global:posterurl
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                            break
                        }
                    }
                }
                Else {
                    Write-Entry -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)#artwork"
            }
        }
    }
}
function GetTVDBSeasonPoster {
    if ($global:tvdbid) {
        Write-Entry -Subtext "Searching on TVDB for a Season poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
            Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
        }
        if ($response) {
            if ($response.data.seasons) {
                # Select season id from current Seasonnumber
                $SeasonID = $response.data.seasons | Where-Object { $_.number -eq $global:SeasonNumber -and $_.type.type -eq 'official' }
                if (!$SeasonID) {
                    $SeasonID = $response.data.seasons | Where-Object { $_.number -eq $global:SeasonNumber -and $_.type.type -eq 'alternate' }
                }
                try {
                    $Seasonresponse = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/seasons/$($SeasonID.id)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
                }
                catch {
                    Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                    Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                    $errorCount++
                }
                if ($Seasonresponse) {
                    foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($Seasonresponse.data.artwork | Where-Object { $_.language -like "" -and $_.type -eq '7' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($Seasonresponse.data.artwork  | Where-Object { $_.language -like "$lang*" -and $_.type -eq '7' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Entry -Subtext "Found Season Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                                $global:TextlessPoster = $true
                            }
                            Else {
                                Write-Entry -Subtext "Found Season Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                                $global:TVDBAssetTextLang = $lang
                            }
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/seasons/$($Seasonresponse.data.type.type)/$global:SeasonNumber#artwork"

                            return $global:posterurl
                            break
                        }
                    }
                }
                return $global:posterurl
            }
            Else {
                Write-Entry -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/seasons/$($Seasonresponse.data.type.type)/$global:SeasonNumber#artwork"
            }
        }
        Else {
            Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/seasons/$($Seasonresponse.data.type.type)/$global:SeasonNumber#artwork"
        }
    }
}
function GetTVDBShowBackground {
    if ($global:tvdbid) {
        Write-Entry -Subtext "Searching on TVDB for a background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '3' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-Entry -Subtext "Found Textless background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                        $global:TextlessPoster = $true
                        $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                    }
                    Else {
                        if (!$global:OnlyTextless) {
                            $global:posterurl = $defaultImageurl
                            Write-Entry -Subtext "Found background with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                        }
                        Else {
                            Write-Entry -Subtext "Found Poster with text on TVDB, skipping because you only want textless..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                        }
                    }
                    return $global:posterurl
                }
                Else {
                    Write-Entry -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
            }
        }
        Else {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
                Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
            if ($response) {
                if ($response.data) {
                    foreach ($lang in $global:PreferredLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Entry -Subtext "Found background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Found background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                                $global:TVDBAssetTextLang = $lang
                            }
                            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"

                            return $global:posterurl
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-Entry -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                        $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                    }
                }
                Else {
                    Write-Entry -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                }
            }
            Else {
                Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
            }
        }
    }
}
function GetTVDBTitleCard {
    if ($global:tvdbid) {
        Write-Entry -Subtext "Searching on TVDB for: $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/episodes/default?" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
            Write-Entry -Subtext "Could not query TVDB url, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
        }
        if ($response) {
            if ($response.data.episodes) {
                $global:NoLangImageUrl = $response.data.episodes | Where-Object { $_.seasonNumber -eq $global:season_number -and $_.number -eq $global:episodenumber }
                if ($global:NoLangImageUrl.image) {
                    $global:posterurl = $global:NoLangImageUrl.image
                    Write-Entry -Subtext "Found Title Card on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
                    $global:TextlessPoster = $true
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.series.slug)/episodes/$($global:NoLangImageUrl.id)"

                    return $global:NoLangImageUrl.image
                }
                Else {
                    Write-Entry -Subtext "No Title Card found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                    Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                    $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                    $errorCount++
                }
            }
            Else {
                Write-Entry -Subtext "No Title Card found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
                $errorCount++
            }
        }
        Else {
            Write-Entry -Subtext "TVDB API response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $global:TVDBAssetChangeUrl = "https://thetvdb.com/series/$($response.data.slug)/#artwork"
            $errorCount++
        }
    }
}
function GetIMDBPoster {
    $response = Invoke-WebRequest -Uri "https://www.imdb.com/title/$($global:imdbid)/mediaviewer" -Method GET
    $global:posterurl = $response.images.src[1]
    if (!$global:posterurl) {
        Write-Entry -Subtext "No show match or poster found on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    }
    Else {
        Write-Entry -Subtext "Found Poster with text on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Blue -log Info
        return $global:posterurl
    }
}
function GetPlexArtwork {
    param(
        [string]$Type,
        [string]$ArtUrl,
        [string]$TempImage
    )
    Write-Entry -Subtext "Searching on Plex for$Type" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    try {
        Invoke-WebRequest -Uri $ArtUrl -OutFile $TempImage -Headers $extraPlexHeaders
    }
    catch {
        Write-Entry -Subtext "Could not download Artwork from plex, Error Message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        $errorCount++
        break
    }

    $magickcommand = "& `"$magick`" identify -verbose `"$TempImage`""
    $magickcommand | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

    # Execute command and get exif data
    $value = (Invoke-Expression $magickcommand | Select-String -Pattern 'overlay|titlecard|created with ppm')

    if ($value) {
        $ExifFound = $True
        Write-Entry -Subtext "Artwork has exif data from ppm/pmm/tcm, cant take it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
        Remove-Item -LiteralPath $TempImage | out-null
    }
    Else {
        Write-Entry -Subtext "No ppm/pmm/tcm exif data found, taking Plex artwork..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
        $global:PlexartworkDownloaded = $true
        $global:posterurl = $ArtUrl
    }
}
function Push-ObjectToDiscord {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$strDiscordWebhook,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [object]$objPayload
    )
    try {
        $null = Invoke-RestMethod -Method Post -Uri $strDiscordWebhook -Body $objPayload -ContentType 'Application/Json'
        Start-Sleep -Seconds 1
    }
    catch {
        Write-Entry -Message "Unable to send to Discord. $($_)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Write-Entry -Message "$objPayload" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
    }
}
function CheckJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$jsonExampleUrl,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [object]$jsonFilePath
    )
    try {
        $AttributeChanged = $null
        # Download the default configuration JSON file from the URL
        $defaultConfig = Invoke-RestMethod -Uri $jsonExampleUrl -Method Get -ErrorAction Stop

        # Read the existing configuration file if it exists
        if (Test-Path $jsonFilePath) {
            try {
                $config = Get-Content -Path $jsonFilePath -Raw | ConvertFrom-Json
            }
            catch {
                Write-Entry -Message "Failed to read the existing configuration file: $jsonFilePath. Please ensure it is valid JSON. Aborting..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Exit
            }
        }
        else {
            $config = @{}
        }

        # Check and add missing keys from the default configuration
        foreach ($partKey in $defaultConfig.PSObject.Properties.Name) {
            # Check if the part exists in the current configuration
            if (-not $config.PSObject.Properties.Name.Contains($partKey)) {
                if (-not $config.PSObject.Properties.Name.tolower().Contains($partKey.tolower())) {
                    # Add "SeasonPosterOverlayPart" if it's missing in $config
                    if (-not $config.PSObject.Properties.Name.tolower().Contains("SeasonPosterOverlayPart")) {
                        $config | Add-Member -MemberType NoteProperty -Name "SeasonPosterOverlayPart" -Value $defaultConfig.PosterOverlayPart
                        Write-Entry -Message "Missing Main Attribute in your Config file: $partKey." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                        Write-Entry -Subtext "I will copy all settings from 'PosterOverlayPart'..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        Write-Entry -Subtext "Adding it for you... In GH Readme, look for $partKey - if you want to see what changed..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        Write-Entry -Subtext "GH Readme -> https://github.com/fscorrupt/Plex-Poster-Maker/blob/main/README.md#configuration" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        # Convert the updated configuration object back to JSON and save it, then reload it
                        $configJson = $config | ConvertTo-Json -Depth 10
                        $configJson | Set-Content -Path $jsonFilePath -Force
                        $config = Get-Content -Path $jsonFilePath -Raw | ConvertFrom-Json
                    }
                    Else {
                        Write-Entry -Message "Missing Main Attribute in your Config file: $partKey." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                        Write-Entry -Subtext "Adding it for you... In GH Readme, look for $partKey - if you want to see what changed..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        Write-Entry -Subtext "GH Readme -> https://github.com/fscorrupt/Plex-Poster-Maker/blob/main/README.md#configuration" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        $config | Add-Member -MemberType NoteProperty -Name $partKey -Value $defaultConfig.$partKey
                        $AttributeChanged = $True
                    }
                }
                else {
                    # Inform user about the case issue
                    Write-Entry -Message "The Main Attribute '$partKey' in your configuration file has a different casing than the expected property." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                    Write-Entry -Subtext "Please correct the casing of the property in your configuration file to '$partKey'." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                    Exit  # Abort the script
                }
            }
            else {
                # Check each key in the part
                foreach ($propertyKey in $defaultConfig.$partKey.PSObject.Properties.Name) {
                    # Show user that a sub-attribute is missing
                    if (-not $config.$partKey.PSObject.Properties.Name.Contains($propertyKey)) {
                        if (-not $config.$partKey.PSObject.Properties.Name.tolower().Contains($propertyKey.tolower())) {
                            Write-Entry -Message "Missing Sub-Attribute in your Config file: $partKey.$propertyKey" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            Write-Entry -Subtext "Adding it for you... In GH Readme, look for $partKey.$propertyKey - if you want to see what changed..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            Write-Entry -Subtext "GH Readme -> https://github.com/fscorrupt/Plex-Poster-Maker/blob/main/README.md#configuration" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            # Add the property using the expected casing
                            $config.$partKey | Add-Member -MemberType NoteProperty -Name $propertyKey -Value $defaultConfig.$partKey.$propertyKey -Force
                            $AttributeChanged = $True
                        }
                        else {
                            # Inform user about the case issue
                            Write-Entry -Message "The Sub-Attribute '$partKey.$propertyKey' in your configuration file has a different casing than the expected property." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            Write-Entry -Subtext "Please correct the casing of the Sub-Attribute in your configuration file to '$partKey.$propertyKey'." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
                            Exit  # Abort the script
                        }
                    }
                }
            }
        }
        if ($AttributeChanged -eq 'True') {
            # Convert the updated configuration object back to JSON and save it
            $configJson = $config | ConvertTo-Json -Depth 10
            $configJson | Set-Content -Path $jsonFilePath -Force

            Write-Entry -Subtext "Configuration file updated successfully." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
        }
    }
    catch [System.Net.WebException] {
        Write-Entry -Message "Failed to download the default configuration JSON file from the URL." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Exit
    }
    catch {
        Write-Entry -Message "An unexpected error occurred: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Exit
    }
}
function CheckJsonPaths {
    param (
        [string]$font,
        [string]$backgroundfont,
        [string]$titlecardfont,
        [string]$Posteroverlay,
        [string]$Backgroundoverlay,
        [string]$titlecardoverlay
    )

    $paths = @($font, $backgroundfont, $titlecardfont, $Posteroverlay, $Backgroundoverlay, $titlecardoverlay)

    $errorCount = 0
    foreach ($path in $paths) {
        if (-not (Test-Path $path)) {
            Write-Entry -Message "Could not find file in: $path" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "Check config for typos and make sure that the file is present in scriptroot." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
        }
    }

    if ($errorCount -ge 1) {
        Exit
    }
}

function Get-Platform {
    if ($global:OSType -eq 'DockerAlpine') {
        return 'Docker'
    }
    elseif ($global:OSType -eq 'Unix' -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -notlike 'PSDocker-Alpine*') {
        return 'Linux'
    }
    elseif ($global:OSType -eq 'Win32NT') {
        return 'Windows'
    }
    else {
        return 'Unknown'
    }
}

function Get-LatestScriptVersion {
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Entry -Subtext "Could not query latest script version, Error: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        return $null
    }
}

function RotateLogs {
    param (
        [string]$ScriptRoot
    )

    $logFolder = Join-Path $ScriptRoot "Logs"
    $global:RotationFolderName = "RotatedLogs"
    $RotationFolder = Join-Path $ScriptRoot $global:RotationFolderName

    # Create Rotation Folder if missing
    if (!(Test-Path -path $RotationFolder)) {
        New-Item -ItemType Directory -Path $ScriptRoot -Name $global:RotationFolderName -Force | Out-Null
    }

    # Check if the log folder exists
    if (Test-Path -Path $logFolder -PathType Container) {
        # Rename the existing log folder with a timestamp
        $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
        Rename-Item -Path $logFolder -NewName "Logs`_$timestamp"
        # Create Rotation Folder if missing
        if (!(Test-Path $RotationFolder)) {
            New-Item -ItemType Directory -Path $ScriptRoot -Name $global:RotationFolderName -Force | Out-Null
        }
        # Move logs to Rotation Folder
        Move-Item -Path "$logFolder`_$timestamp" $RotationFolder
    }
}

function CheckConfigFile {
    param (
        [string]$ScriptRoot
    )

    if (!(Test-Path (Join-Path $ScriptRoot 'config.json'))) {
        Write-Entry -Message "Config File missing, downloading it for you..." -Path "$ScriptRoot\Logs\Scriptlog.log" -Color White -log Info
        Invoke-WebRequest -Uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/config.example.json" -OutFile "$ScriptRoot\config.json"
        Write-Entry -Subtext "Config File downloaded here: '$ScriptRoot\config.json'" -Path "$ScriptRoot\Logs\Scriptlog.log" -Color White -log Info
        Write-Entry -Subtext "Please configure the config file according to GitHub, Exit script now..." -Path "$ScriptRoot\Logs\Scriptlog.log" -Color Yellow -log Warning
        Exit
    }
}

function Test-And-Download {
    param(
        [string]$url,
        [string]$destination
    )

    if (!(Test-Path $destination)) {
        Invoke-WebRequest -Uri $url -OutFile $destination
    }
}

function RedactPlexUrl {
    param(
        [string]$url
    )

    $urlMatch = $url -match "(https?://)([^:/]+)(:\d+)?(/[^?]+)(\?X-Plex-Token=)([^&]+)(.*)"
    if ($urlMatch) {
        $protocol = $Matches[1]
        $hostname = $Matches[2]
        $port = $Matches[3]
        $path = $Matches[4]
        $prefix = $Matches[5]
        $token = $Matches[6]
        $suffix = $Matches[7]

        # Redact IP address or hostname
        $redactedHostname = $hostname -replace "(?<=.{3}).", "*"
        $redactedUrl = $protocol + $redactedHostname + $port + $path

        # Redact token
        $redactedToken = $($token[0..7] -join '') + "*******"
        $redactedUrl += $prefix + $redactedToken + $suffix

        return $redactedUrl
    }
    else {
        return $url
    }
}
function LogConfigSettings {
    Write-Entry -Message "Current Config.json Settings" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "___________________________________________" -Path $configLogging -Color DarkMagenta -log Info
    # Plex Part
    Write-Entry -Subtext "API Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| TVDB API Key:                 $($global:tvdbapi[0..7] -join '')****" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| TMDB API Read Access Token:   $($global:tmdbtoken[0..7] -join '')****" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Fanart API Key:               $($FanartTvAPIKey[0..7] -join '')****" -Path $configLogging -Color White -log Info
    if ($PlexToken) {
        Write-Entry -Subtext "| Plex Token:                   $($PlexToken[0..7] -join '')****" -Path $configLogging -Color White -log Info
    }
    Write-Entry -Subtext "| Fav Provider:                 $global:FavProvider" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Preferred Lang Order:         $($global:PreferredLanguageOrder -join ',')" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "Plex Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| Excluded Libs:                $($LibstoExclude -join ',')" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Plex Url:                     $($PlexUrl[0..10] -join '')****" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "Prerequisites Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| Asset Path:                   $AssetPath" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Show skipped:                 $show_skipped" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Script Root:                  $global:ScriptRoot" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Magick Location:              $magickinstalllocation" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| # of Log Folders to retain:   $maxLogs" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Log Level:                    $logLevel" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used Poster Font:             $font" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used Background Font:         $backgroundfont" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used TitleCard Font:          $titlecardfont" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used Poster Overlay File:     $Posteroverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used Background Overlay File: $Backgroundoverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Used TitleCard Overlay File:  $titlecardoverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Create Library Folders:       $LibraryFolders" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Create Season Posters:        $global:SeasonPosters" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Create Posters:               $global:Posters" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Create Background Posters:    $global:BackgroundPosters" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Create Title Cards:           $global:TitleCards" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay General Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| Process Images:               $global:ImageProcessing" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay Poster Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| All Caps on Text:             $fontAllCaps" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Border to Image:          $AddBorder" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Text to Image:            $AddText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Overlay to Image:         $AddOverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Font Color:                   $fontcolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Color:                 $bordercolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Min Font Size:                $minPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Max Font Size:                $maxPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Width:                 $borderwidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Width:               $MaxWidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Height:              $MaxHeight" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Offset:              $text_offset" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay Background Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| All Caps on Text:             $BackgroundfontAllCaps" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Border to Background:     $AddBackgroundBorder" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Text to Background:       $AddBackgroundText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Overlay to Background:    $AddBackgroundOverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Font Color:                   $Backgroundfontcolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Color:                 $Backgroundbordercolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Min Font Size:                $BackgroundminPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Max Font Size:                $BackgroundmaxPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Width:                 $Backgroundborderwidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Width:               $BackgroundMaxWidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Height:              $BackgroundMaxHeight" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Offset:              $Backgroundtext_offset" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay TitleCard Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| Use Background as Title Card: $UseBackgroundAsTitleCard" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Border to Background:     $AddTitleCardBorder" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Color:                 $TitleCardbordercolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Overlay to Background:    $AddTitleCardOverlay" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Border Width:                 $TitleCardborderwidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay TitleCard Title Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| All Caps on Text:             $TitleCardEPTitlefontAllCaps" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Title to TitleCard:       $AddTitleCardEPTitleText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Font Color:                   $TitleCardEPTitlefontcolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Min Font Size:                $TitleCardEPTitleminPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Max Font Size:                $TitleCardEPTitlemaxPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Width:               $TitleCardEPTitleMaxWidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Height:              $TitleCardEPTitleMaxHeight" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Offset:              $TitleCardEPTitletext_offset" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "OverLay TitleCard EP Part" -Path $configLogging -Color Cyan -log Info
    Write-Entry -Subtext "| Season TC Text:               $SeasonTCText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Episode TC Text:              $EpisodeTCText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| All Caps on Text:             $TitleCardEPfontAllCaps" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Add Episode to TitleCard:     $AddTitleCardEPText" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Font Color:                   $TitleCardEPfontcolor" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Min Font Size:                $TitleCardEPminPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Max Font Size:                $TitleCardEPmaxPointSize" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Width:               $TitleCardEPMaxWidth" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Height:              $TitleCardEPMaxHeight" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "| Text Box Offset:              $TitleCardEPtext_offset" -Path $configLogging -Color White -log Info
    Write-Entry -Subtext "___________________________________________" -Path $configLogging -Color DarkMagenta -log Info
}

function CheckPlexAccess {
    param (
        [string]$PlexUrl,
        [string]$PlexToken
    )

    if ($PlexToken) {
        Write-Entry -Message "Plex token found, checking access now..." -Path $configLogging -Color White -log Info
        try {
            $response = Invoke-WebRequest -Uri "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken" -ErrorAction Stop -Headers $extraPlexHeaders
            if ($response.StatusCode -eq 200) {
                Write-Entry -Subtext "Plex access is working..." -Path $configLogging -Color Green -log Info
                # Check if libs are available
                [XML]$Libs = $response.Content
                if ($Libs.MediaContainer.size -ge 1) {
                    return $Libs
                }
                else {
                    Write-Entry -Subtext "No libs on Plex, abort script now..." -Path $configLogging -Color Red -log Error
                    Exit
                }
            }
            else {
                Write-Entry -Message "Could not access Plex with this URL: $(RedactPlexUrl -url "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken")" -Path $configLogging -Color Red -Log Error
                Write-Entry -Subtext "Please check token and access..." -Path $configLogging -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
                Exit
            }
        }
        catch {
            Write-Entry -Subtext "Could not access Plex with this URL: $(RedactPlexUrl -url "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken")" -Path $configLogging -Color Red -Log Error
            Write-Entry -Subtext "Error occurred while accessing Plex server: $($_.Exception.Message)" -Path $configLogging -Color Red -log Error
            Exit
        }
    }
    else {
        Write-Entry -Message "Checking Plex access now..." -Path $configLogging -Color White -log Info
        try {
            $result = Invoke-WebRequest -Uri "$PlexUrl/library/sections" -ErrorAction SilentlyContinue -Headers $extraPlexHeaders
            if ($result.StatusCode -eq 200) {
                Write-Entry -Subtext "Plex access is working..." -Path $configLogging -Color Green -log Info
                # Check if libs are available
                [XML]$Libs = $result.Content
                if ($Libs.MediaContainer.size -ge 1) {
                    Write-Entry -Subtext "Found libs on Plex..." -Path $configLogging -Color White -log Info
                    return $Libs
                }
                else {
                    Write-Entry -Subtext "No libs on Plex, abort script now..." -Path $configLogging -Color Red -log Error
                    Exit
                }
            }
        }
        catch {
            Write-Entry -Subtext "Error occurred while accessing Plex server: $($_.Exception.Message)" -Path $configLogging -Color Red -log Error
            Write-Entry -Subtext "Please check access and settings in Plex..." -Path $configLogging -Color Yellow -log Warning
            Write-Entry -Message "To be able to connect to Plex without authentication" -Path $configLogging -Color White -log Info
            Write-Entry -Message "You have to enter your IP range in 'Settings -> Network -> List of IP addresses and networks that are allowed without auth: '192.168.1.0/255.255.255.0''" -Path $configLogging -Color White -log Info
            Exit
        }
    }
}


function CheckImageMagick {
    param (
        [string]$magick,
        [string]$magickinstalllocation
    )

    if (!(Test-Path $magick)) {
        if ($global:OSType -ne "Win32NT") {
            if ($global:OSType -ne "DockerAlpine") {
                Write-Entry -Message "ImageMagick missing, downloading the portable version for you..." -Path $configLogging -Color Yellow -log Warning
                $magickUrl = "https://imagemagick.org/archive/binaries/magick"
                Invoke-WebRequest -Uri $magickUrl -OutFile "$global:ScriptRoot/magick"
                chmod +x "$global:ScriptRoot/magick"
                Write-Entry -Subtext "Made the portable Magick executable..." -Path $configLogging -Color Green -log Info
            }
        }
        else {
            Write-Entry -Message "ImageMagick missing, downloading it for you..." -Path $configLogging -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
            $result = Invoke-WebRequest "https://imagemagick.org/archive/binaries/?C=M;O=D"
            $LatestRelease = ($result.links.href | Where-Object { $_ -like '*portable-Q16-HDRI-x64.zip' } | Sort-Object -Descending)[0]
            $DownloadPath = Join-Path -Path $global:ScriptRoot -ChildPath (Join-Path -Path 'temp' -ChildPath $LatestRelease)
            Invoke-WebRequest "https://imagemagick.org/archive/binaries/$LatestRelease" -OutFile $DownloadPath
            Expand-Archive -Path $DownloadPath -DestinationPath $magickinstalllocation -Force
            if ((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name -eq $($LatestRelease.replace('.zip', ''))) {
                Copy-item -Force -Recurse "$magickinstalllocation\$((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name)\*" $magickinstalllocation
                Remove-Item -Recurse -LiteralPath "$magickinstalllocation\$((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name)" -Force
            }
            if (Test-Path -LiteralPath $magickinstalllocation\magick.exe) {
                Write-Entry -Subtext "Placed Portable ImageMagick here: $magickinstalllocation" -Path $configLogging -Color Green -log Info
            }
            Else {
                Write-Entry -Subtext "Error During extraction, please manually install/copy portable Imagemagick from here: https://imagemagick.org/archive/binaries/$LatestRelease" -Path $configLogging -Color Red -log Error
            }
        }
    }
}

function CheckOverlayDimensions {
    param (
        [string]$Posteroverlay,
        [string]$Backgroundoverlay,
        [string]$Titlecardoverlay,
        [string]$PosterSize,
        [string]$BackgroundSize
    )

    # Use magick to check dimensions
    $Posteroverlaydimensions = & $magick $Posteroverlay -format "%wx%h" info:
    $Backgroundoverlaydimensions = & $magick $Backgroundoverlay -format "%wx%h" info:
    $Titlecardoverlaydimensions = & $magick $Titlecardoverlay -format "%wx%h" info:

    # Check Poster Overlay Size
    if ($Posteroverlaydimensions -eq $PosterSize) {
        Write-Entry -Subtext "Poster overlay is correctly sized at: $Postersize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    }
    else {
        Write-Entry -Subtext "Poster overlay is NOT correctly sized at: $Postersize. Actual dimensions: $Posteroverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    }

    # Check Background Overlay Size
    if ($Backgroundoverlaydimensions -eq $BackgroundSize) {
        Write-Entry -Subtext "Background overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    }
    else {
        Write-Entry -Subtext "Background overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $Backgroundoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    }

    # Check TitleCard Overlay Size
    if ($Titlecardoverlaydimensions -eq $BackgroundSize) {
        Write-Entry -Subtext "TitleCard overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    }
    else {
        Write-Entry -Subtext "TitleCard overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $Titlecardoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    }
}

function InvokeMagickCommand {
    param (
        [string]$Command,
        [string]$Arguments
    )
    function GetMagickErrorMessage {
        param (
            [string]$ErrorMessage
        )

        # Split the error message into lines
        $lines = $ErrorMessage -split "convert: |magick.exe: |@"
        return $lines[1]
    }

    $processInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processInfo.FileName = $Command
    $processInfo.Arguments = $Arguments
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $processInfo
    $process.Start() | Out-Null

    # Capture error
    $errorOutput = $process.StandardError.ReadToEnd()

    # Wait for the process to exit
    $process.WaitForExit()

    # Check if there was any error output
    if (-not [string]::IsNullOrWhiteSpace($errorOutput)) {
        Write-Entry -Subtext "An error occurred while executing the magick command:" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Write-Entry -Subtext (GetMagickErrorMessage $errorOutput) -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log info
    }
}

function CheckCharLimit {
    # Attempt to get the registry key
    try {
        $regKey = Get-Item -ErrorAction Stop -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"

        # Get the value of LongPathsEnabled
        $longPathsEnabled = $regKey.GetValue("LongPathsEnabled")

        if ($longPathsEnabled -eq 1) {
            return $true
        }
        Else {
            return $false
        }
    }
    catch {
        # Handle any errors accessing the registry key
        Write-Entry -Subtext "$($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        return $false
    }
}

##### PRE-START #####
# Set some global vars
Set-OSTypeAndScriptRoot
# Get platform
$Platform = Get-Platform
# Get Latest Script Version
$LatestScriptVersion = Get-LatestScriptVersion
##### START #####
$startTime = Get-Date
# Rotate logs before doing anything!
$folderPattern = "Logs_*"
$global:RotationFolderName = $null
$global:logLevel = 2
RotateLogs -ScriptRoot $global:ScriptRoot
Write-Entry -Message "Starting..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
# Check if Config file is present
CheckConfigFile -ScriptRoot $global:ScriptRoot
# Test Json if something is missing
CheckJson -jsonExampleUrl "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/config.example.json" -jsonFilePath $(Join-Path $global:ScriptRoot 'config.json')
# Check if Script is Latest
if ($CurrentScriptVersion -eq $LatestScriptVersion) {
    Write-Entry -Message "You are Running Version - v$CurrentScriptVersion" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
}
Else {
    Write-Entry -Message "You are Running Version: v$CurrentScriptVersion - Latest Version is: v$LatestScriptVersion" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
}
# load config file
$config = Get-Content -Raw -Path $(Join-Path $global:ScriptRoot 'config.json') | ConvertFrom-Json
# Now is the earliest that you can set your logLevel other than 2
# Read logLevel value from config.json
$global:logLevel = [int]$config.PrerequisitePart.logLevel
# Check if the cast was successful
if ($null -eq $global:logLevel) {
    Write-Entry -Message "Value for logLevel was null. Setting it to 1. Adjust your config.json accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $global:logLevel = 1
}
# Ensure $logLevel is at least 1
if ($global:logLevel -le 0) {
    Write-Entry -Message "Value for logLevel -le 0. Setting it to 1. Adjust your config.json accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $global:logLevel = 1
}# Ensure $logLevel is le 3
if ($global:logLevel -gt 3) {
    Write-Entry -Message "Value for logLevel -gt 3. Setting it to 3. Adjust your config.json accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $global:logLevel = 3
}
# Read naxLogs value from config.json
$maxLogs = [int]$config.PrerequisitePart.maxLogs  # Cast to integer
# Check if the cast was successful
if ($null -eq $maxLogs) {
    Write-Entry -Message "Value for maxLogs was null. Setting it to 1. Adjust your config.json accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $maxLogs = 1
}
# Ensure $maxLogs is at least 1
if ($maxLogs -le 0) {
    Write-Entry -Message "Value for maxLogs -le 0. Setting it to 1. Adjust your config.json accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $maxLogs = 1
}
# Delete excess log folders
$logFolders = Get-ChildItem -Path $(Join-Path $global:ScriptRoot $global:RotationFolderName) -Directory | Where-Object { $_.Name -match $folderPattern } | Sort-Object CreationTime -Descending | Select-Object -First $maxLogs
foreach ($folder in (Get-ChildItem -Path $(Join-Path $global:ScriptRoot $global:RotationFolderName) -Directory | Where-Object { $_.Name -match $folderPattern })) {
    if ($folder.FullName -notin $logFolders.FullName) {
        Remove-Item -Path $folder.FullName -Recurse -Force
        $fldrName = $folder.FullName
        Write-Entry -Message "Deleting excess folder: $fldrName" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
}

# Access variables from the config file
# Notification Part
$global:SendNotification = $config.Notification.SendNotification

if ($env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
    $global:NotifyUrl = $config.Notification.AppriseUrl
    if ($global:NotifyUrl -eq 'discord://{WebhookID}/{WebhookToken}/' -and $global:SendNotification -eq 'True') {
        # Try the normal discord url
        $global:NotifyUrl = $config.Notification.Discord
        if ($global:NotifyUrl -eq 'https://discordapp.com/api/webhooks/{WebhookID}/{WebhookToken}' -and $global:SendNotification -eq 'True') {
            Write-Entry -Message "Found default Notification Url, please update url in config..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Pause
            Exit
        }
    }
    if (!$global:NotifyUrl -and $global:SendNotification -eq 'True') {
        $global:NotifyUrl = $config.Notification.Discord
    }
}
Else {
    $global:NotifyUrl = $config.Notification.Discord
    if ($global:NotifyUrl -eq 'https://discordapp.com/api/webhooks/{WebhookID}/{WebhookToken}' -and $global:SendNotification -eq 'True') {
        Write-Entry -Message "Found default Notification Url, please update url in config..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Pause
        Exit
    }
}

# API Part
$global:tvdbapi = $config.ApiPart.tvdbapi
$global:tmdbtoken = $config.ApiPart.tmdbtoken
$FanartTvAPIKey = $config.ApiPart.FanartTvAPIKey
$PlexToken = $config.ApiPart.PlexToken
$global:FavProvider = $config.ApiPart.FavProvider.ToUpper()
$global:PreferredLanguageOrder = $config.ApiPart.PreferredLanguageOrder
# default Lang order if missing in config
if (!$global:PreferredLanguageOrder) {
    Write-Entry -Message "Lang search Order not set in Config, setting it to 'xx,en,de' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $global:PreferredLanguageOrder = "xx", "en", "de"
}
$global:PreferredLanguageOrderTMDB = $global:PreferredLanguageOrder.Replace('xx', 'null')
$global:PreferredLanguageOrderFanart = $global:PreferredLanguageOrder.Replace('xx', '00')
$global:PreferredLanguageOrderTVDB = $global:PreferredLanguageOrder.Replace('xx', 'null')
if ($global:PreferredLanguageOrder[0] -eq 'xx' -or $global:PreferredLanguageOrder -eq 'xx') {
    $global:PreferTextless = $true
    if ( $PreferredLanguageOrder.count -eq "1") {
        $global:OnlyTextless = $true
    }
}
Else {
    $global:PreferTextless = $false
}
# default to TMDB if favprovider missing
if (!$global:FavProvider) {
    Write-Entry -Message "FavProvider not set in config, setting it to 'TMDB' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
    $global:FavProvider = 'TMDB'
}

# Plex Part
$LibstoExclude = $config.PlexPart.LibstoExclude
$PlexUrl = $config.PlexPart.PlexUrl
# Prerequisites Part
$show_skipped = $config.PrerequisitePart.show_skipped
$AssetPath = RemoveTrailingSlash $config.PrerequisitePart.AssetPath

# Check if its a Network Share
if ($AssetPath.StartsWith("\")) {
    # add \ if it only Starts with one
    if (!$AssetPath.StartsWith("\\")) {
        $AssetPath = "\" + $AssetPath
    }
}

# Construct cross-platform paths
if ($global:OSType -ne "Win32NT") {
    $joinsymbol = "/"
}
Else {
    $joinsymbol = "\"
}
$font = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.font -join $($joinsymbol))
$backgroundfont = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.backgroundfont -join $($joinsymbol))
$titlecardfont = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.titlecardfont -join $($joinsymbol))
$Posteroverlay = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.overlayfile -join $($joinsymbol))
$Backgroundoverlay = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.backgroundoverlayfile -join $($joinsymbol))
$titlecardoverlay = Join-Path -Path $global:ScriptRoot -ChildPath ('temp', $config.PrerequisitePart.titlecardoverlayfile -join $($joinsymbol))
$testimage = Join-Path -Path $global:ScriptRoot -ChildPath ('test', 'testimage.png' -join $($joinsymbol))
$backgroundtestimage = Join-Path -Path $global:ScriptRoot -ChildPath ('test', 'backgroundtestimage.png' -join $($joinsymbol))
$LibraryFolders = $config.PrerequisitePart.LibraryFolders
$global:SeasonPosters = $config.PrerequisitePart.SeasonPosters
$global:Posters = $config.PrerequisitePart.Posters
$global:BackgroundPosters = $config.PrerequisitePart.BackgroundPosters
$global:TitleCards = $config.PrerequisitePart.TitleCards

# Poster Overlay Part
$global:ImageProcessing = $config.OverlayPart.ImageProcessing
$global:outputQuality = $config.OverlayPart.outputQuality
# Poster Overlay Part
$fontAllCaps = $config.PosterOverlayPart.fontAllCaps
$AddBorder = $config.PosterOverlayPart.AddBorder
$AddText = $config.PosterOverlayPart.AddText
$AddOverlay = $config.PosterOverlayPart.AddOverlay
$fontcolor = $config.PosterOverlayPart.fontcolor
$bordercolor = $config.PosterOverlayPart.bordercolor
$minPointSize = $config.PosterOverlayPart.minPointSize
$maxPointSize = $config.PosterOverlayPart.maxPointSize
$borderwidth = $config.PosterOverlayPart.borderwidth
$MaxWidth = $config.PosterOverlayPart.MaxWidth
$MaxHeight = $config.PosterOverlayPart.MaxHeight
$text_offset = $config.PosterOverlayPart.text_offset
$borderwidthsecond = $borderwidth + 'x' + $borderwidth
$boxsize = $MaxWidth + 'x' + $MaxHeight

# Season Poster Overlay Part
$SeasonfontAllCaps = $config.SeasonPosterOverlayPart.fontAllCaps
$AddSeasonBorder = $config.SeasonPosterOverlayPart.AddBorder
$AddSeasonText = $config.SeasonPosterOverlayPart.AddText
$AddSeasonOverlay = $config.SeasonPosterOverlayPart.AddOverlay
$Seasonfontcolor = $config.SeasonPosterOverlayPart.fontcolor
$Seasonbordercolor = $config.SeasonPosterOverlayPart.bordercolor
$SeasonminPointSize = $config.SeasonPosterOverlayPart.minPointSize
$SeasonmaxPointSize = $config.SeasonPosterOverlayPart.maxPointSize
$Seasonborderwidth = $config.SeasonPosterOverlayPart.borderwidth
$SeasonMaxWidth = $config.SeasonPosterOverlayPart.MaxWidth
$SeasonMaxHeight = $config.SeasonPosterOverlayPart.MaxHeight
$Seasontext_offset = $config.SeasonPosterOverlayPart.text_offset
$Seasonborderwidthsecond = $borderwidth + 'x' + $borderwidth
$Seasonboxsize = $SeasonMaxWidth + 'x' + $SeasonMaxHeight

# Background Overlay Part
$BackgroundfontAllCaps = $config.BackgroundOverlayPart.fontAllCaps
$AddBackgroundOverlay = $config.BackgroundOverlayPart.AddOverlay
$AddBackgroundBorder = $config.BackgroundOverlayPart.AddBorder
$AddBackgroundText = $config.BackgroundOverlayPart.AddText
$Backgroundfontcolor = $config.BackgroundOverlayPart.fontcolor
$Backgroundbordercolor = $config.BackgroundOverlayPart.bordercolor
$BackgroundminPointSize = $config.BackgroundOverlayPart.minPointSize
$BackgroundmaxPointSize = $config.BackgroundOverlayPart.maxPointSize
$Backgroundborderwidth = $config.BackgroundOverlayPart.borderwidth
$BackgroundMaxWidth = $config.BackgroundOverlayPart.MaxWidth
$BackgroundMaxHeight = $config.BackgroundOverlayPart.MaxHeight
$Backgroundtext_offset = $config.BackgroundOverlayPart.text_offset
$Backgroundborderwidthsecond = $Backgroundborderwidth + 'x' + $Backgroundborderwidth
$Backgroundboxsize = $BackgroundMaxWidth + 'x' + $BackgroundMaxHeight

# Title Card Overlay Part
$AddTitleCardOverlay = $config.TitleCardOverlayPart.AddOverlay
$UseBackgroundAsTitleCard = $config.TitleCardOverlayPart.UseBackgroundAsTitleCard
$AddTitleCardBorder = $config.TitleCardOverlayPart.AddBorder
$TitleCardborderwidth = $config.TitleCardOverlayPart.borderwidth
$TitleCardbordercolor = $config.TitleCardOverlayPart.bordercolor

# Title Card Title Text Part
$TitleCardEPTitlefontAllCaps = $config.TitleCardTitleTextPart.fontAllCaps
$AddTitleCardEPTitleText = $config.TitleCardTitleTextPart.AddEPTitleText
$TitleCardEPTitlefontcolor = $config.TitleCardTitleTextPart.fontcolor
$TitleCardEPTitleminPointSize = $config.TitleCardTitleTextPart.minPointSize
$TitleCardEPTitlemaxPointSize = $config.TitleCardTitleTextPart.maxPointSize
$TitleCardEPTitleMaxWidth = $config.TitleCardTitleTextPart.MaxWidth
$TitleCardEPTitleMaxHeight = $config.TitleCardTitleTextPart.MaxHeight
$TitleCardEPTitletext_offset = $config.TitleCardTitleTextPart.text_offset

# Title Card EP Text Part
$SeasonTCText = $config.TitleCardEPTextPart.SeasonTCText
$EpisodeTCText = $config.TitleCardEPTextPart.EpisodeTCText
$TitleCardEPfontAllCaps = $config.TitleCardEPTextPart.fontAllCaps
$AddTitleCardEPText = $config.TitleCardEPTextPart.AddEPText
$TitleCardEPfontcolor = $config.TitleCardEPTextPart.fontcolor
$TitleCardEPminPointSize = $config.TitleCardEPTextPart.minPointSize
$TitleCardEPmaxPointSize = $config.TitleCardEPTextPart.maxPointSize
$TitleCardEPMaxWidth = $config.TitleCardEPTextPart.MaxWidth
$TitleCardEPMaxHeight = $config.TitleCardEPTextPart.MaxHeight
$TitleCardEPtext_offset = $config.TitleCardEPTextPart.text_offset

$TitleCardborderwidthsecond = $TitleCardborderwidth + 'x' + $TitleCardborderwidth
$TitleCardEPTitleboxsize = $TitleCardEPTitleMaxWidth + 'x' + $TitleCardEPTitleMaxHeight
$TitleCardEPboxsize = $TitleCardEPMaxWidth + 'x' + $TitleCardEPMaxHeight

$PosterSize = "2000x3000"
$BackgroundSize = "3840x2160"
$fontImagemagick = $font.replace('\', '\\')
$backgroundfontImagemagick = $backgroundfont.replace('\', '\\')
$TitleCardfontImagemagick = $TitleCardfont.replace('\', '\\')
if ($global:OSType -ne "Win32NT") {
    if ($global:OSType -eq "DockerAlpine") {
        $magick = 'magick'
    }
    Else {
        $magickinstalllocation = $global:ScriptRoot
        $magick = Join-Path $global:ScriptRoot 'magick'
    }
}
Else {
    $magickinstalllocation = RemoveTrailingSlash $config.PrerequisitePart.magickinstalllocation
    $magick = Join-Path $magickinstalllocation 'magick.exe'
}
$fileExtensions = @(".otf", ".ttf", ".otc", ".ttc", ".png")
$errorCount = 0

# Initialize Other Variables
$SeasonsTemp = $null
$SeasonNames = $null
$SeasonNumbers = $null
$SeasonRatingkeys = $null

# Define cross-platform paths
$LogsPath = Join-Path $global:ScriptRoot 'Logs'
$TempPath = Join-Path $global:ScriptRoot 'temp'
$TestPath = Join-Path $global:ScriptRoot 'test'
$configLogging = Join-Path $LogsPath 'Scriptlog.log'

if ($Manual) {
    $configLogging = Join-Path $LogsPath 'Manuallog.log'
}
if ($Testing) {
    $configLogging = Join-Path $LogsPath 'Testinglog.log'
}

# Create directories if they don't exist
foreach ($path in $LogsPath, $TempPath, $TestPath, $AssetPath) {
    if (!(Test-Path $path)) {
        if ($global:OSType -ne "Win32NT" -and $path -eq 'P:\assets') {
            Write-Entry -Message 'Please change default asset Path...' -Path $configLogging -Color Red -log Error
            Exit
        }
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

# Delete all files and subfolders within the temp directory
if (Test-Path $TempPath) {
    Remove-Item -Path (Join-Path $TempPath '*') -Recurse -Force
    Write-Entry -Message "Deleting temp folder: $TempPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
}

if ($Testing) {
    if ((Test-Path $TestPath)) {
        Remove-Item -Path (Join-Path $TestPath '*') -Recurse -Force
        Write-Entry -Message "Deleting test folder: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
}

# Test and download files if they don't exist
Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/overlay.png" -destination (Join-Path $TempPath 'overlay.png')
Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/backgroundoverlay.png" -destination (Join-Path $TempPath 'backgroundoverlay.png')
Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Rocky.ttf" -destination (Join-Path $TempPath 'Rocky.ttf')

# Write log message
Write-Entry -Message "Old log files cleared..." -Path $configLogging -Color White -log Info
# Display Current Config settings:
LogConfigSettings
# Starting main Script now...
Write-Entry -Message "Starting main Script now..." -Path $configLogging -Color Green -log Info

# Fix asset path based on OS (do it here so that we see what is in config.json versus what script should use)
if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
    $AssetPath = $AssetPath.Replace('\', '/')
}
else {
    $AssetPath = $AssetPath.Replace('/', '\')
}

# Get files in script root with specified extensions
$files = Get-ChildItem -Path $global:ScriptRoot -File | Where-Object { $_.Extension -in $fileExtensions } -ErrorAction SilentlyContinue

# Copy files to the destination directory
foreach ($file in $files) {
    $destinationPath = Join-Path -Path (Join-Path -Path $global:ScriptRoot -ChildPath 'temp') -ChildPath $file.Name
    if (!(Test-Path -LiteralPath $destinationPath)) {
        Copy-Item -Path $file.FullName -Destination $destinationPath -Force | Out-Null
        Write-Entry -Subtext "Found File: '$($file.Name)' in ScriptRoot - copying it into temp folder..." -Path $configLogging -Color Cyan -log Info
    }
}

# Call the function with your variables
CheckJsonPaths -font $font -backgroundfont $backgroundfont -titlecardfont $titlecardfont -Posteroverlay $Posteroverlay -Backgroundoverlay $Backgroundoverlay -titlecardoverlay $titlecardoverlay

# Check Plex now:
[xml]$Libs = CheckPlexAccess -PlexUrl $PlexUrl -PlexToken $PlexToken

# Check ImageMagick now:
CheckImageMagick -magick $magick -magickinstalllocation $magickinstalllocation

# Check overlay artwork for poster, background, and titlecard dimensions
Write-Entry -Message "Checking size of overlay files..." -Path $configLogging -Color White -log Info
CheckOverlayDimensions -Posteroverlay "$Posteroverlay" -Backgroundoverlay "$Backgroundoverlay" -Titlecardoverlay "$titlecardoverlay" -PosterSize "$PosterSize" -BackgroundSize "$BackgroundSize"


# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-Entry -Message "FanartTvAPI Module missing, installing it for you..." -Path $configLogging -Color Red -log Error
    Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
    $errorCount++
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber

    Write-Entry -Subtext "FanartTvAPI Module installed, importing it now..." -Path $configLogging -Color Green -log Info
    Import-Module -Name FanartTvAPI
}
# Add Fanart API
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# Check TMDB Token before building the Header.
if ($global:tmdbtoken.Length -le '35') {
    Write-Entry -Message "TMDB Token is too short, you may have used the API key in your config file. Please use the 'API Read Access Token'." -Path $configLogging -Color Red -log Error
    Exit
}

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

# Plex Headers
$extraPlexHeaders = @{
    'X-Plex-Container-Size' = '1000'
}

if ($Manual) {
    Write-Entry -Message "Manual Poster Creation Started" -Path $global:ScriptRoot\Logs\Manuallog.log -Color DarkMagenta -log Info
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
        $PosterImageoriginal = "$AssetPath\$LibraryName\$FolderName\poster.jpg"
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($SeasonPosterName -eq 'Specials') {
                $global:season = "Season00"
            }
            $PosterImageoriginal = "$AssetPath\$LibraryName\$FolderName\$global:season.jpg"
        }
    }
    Else {
        if ($CreateSeasonPoster -eq 'y') {
            $SeasonPosterName = Read-Host "Enter Season Name"
            if ($SeasonPosterName -match 'Season\s+(\d+)') {
                $global:SeasonNumber = $Matches[1]
                $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')
            }
            if ($SeasonPosterName -eq 'Specials') {
                $global:season = "Season00"
            }
            $PosterImageoriginal = "$AssetPath\$($FolderName)_$global:season.jpg"
        }
    }

    $PosterImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$FolderName.jpg"
    $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
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
        Move-Item -LiteralPath $PicturePath -destination $PosterImage -Force -ErrorAction SilentlyContinue
        Write-Entry -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info

        $CommentArguments = "convert `"$PosterImage`" -set `"comment`" `"created with ppm`" `"$PosterImage`""
        $CommentlogEntry = "`"$magick`" $CommentArguments"
        $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $CommentArguments
        if (!$global:ImageMagickError -eq 'True') {
            # Resize Image to 2000x3000 and apply Border and overlay
            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
            }
            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
            }
            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
                Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
            }
            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
            }

            $logEntry = "`"$magick`" $Arguments"
            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
            InvokeMagickCommand -Command $magick -Arguments $Arguments

            if ($AddText -eq 'true') {
                $joinedTitle = $joinedTitle -replace '"', '""'
                $joinedTitlePointSize = $joinedTitle -replace '""', '""""'
                $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
                $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
                Write-Entry -Subtext "    Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
                $logEntry = "`"$magick`" $Arguments"
                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                InvokeMagickCommand -Command $magick -Arguments $Arguments
            }
        }
    }
    Else {
        # Resize Image to 2000x3000
        $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
        Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Manuallog.log -Color White -log Info
        $logEntry = "`"$magick`" $Resizeargument"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $Resizeargument
    }
    if (!$global:ImageMagickError -eq 'True') {
        # Move file back to original naming with Brackets.
        Move-Item -LiteralPath $PosterImage -destination $PosterImageoriginal -Force -ErrorAction SilentlyContinue
        Write-Entry -Subtext "Poster created and moved to: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Manuallog.log -Color Green -log Info
    }
}
Elseif ($Testing) {
    Write-Entry -Message "Poster Testing Started" -Path $global:ScriptRoot\Logs\Testinglog.log -Color DarkMagenta -log Info
    Write-Entry -Subtext "I will now create a few posters for you with different text lengths using your current configuration settings." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Yellow -log Warning
    # Poster Part
    if (!(Test-Path $testimage)) {
        $ArgumentCreate = "-size `"$PosterSize`" xc:pink -background none `"$testimage`""
        $logEntryCreate = "`"$magick`" $ArgumentCreate"
        $logEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $ArgumentCreate
        Write-Entry -Subtext "Test Poster Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    if (!(Test-Path $backgroundtestimage)) {
        $backgroundArgumentCreate = "-size `"$BackgroundSize`" xc:pink -background none `"$backgroundtestimage`""
        $backgroundlogEntryCreate = "`"$magick`" $backgroundArgumentCreate"
        $backgroundlogEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentCreate
        Write-Entry -Subtext "Test Background/TitleCard Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    $ShortText = "The Hobbit"
    $MediumText = "The Hobbit is a great movie"
    $LongText = "The Hobbit is a great movie that we all loved and enjoyed watching"
    $bullet = [char]0x2022
    $Episodetext = "$SeasonTCText 9999 $bullet $EpisodeTCText 9999"

    $ShortTextCAPS = $ShortText.ToUpper()
    $MediumTextCAPS = $MediumText.ToUpper()
    $LongTextCAPS = $LongText.ToUpper()
    $EpisodetextCAPS = $Episodetext.ToUpper()
    # Posters
    if ($AddText -eq 'true') {
        $TestPosterShort = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterShortText.jpg"
        $TestPosterMedium = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterMediumText.jpg"
        $TestPosterLong = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterLongText.jpg"
        $TestPosterShortCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterShortTextCAPS.jpg"
        $TestPosterMediumCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterMediumTextCAPS.jpg"
        $TestPosterLongCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\posterLongTextCAPS.jpg"
    }
    Else {
        $TestPosterTextless = Join-Path -Path $global:ScriptRoot -ChildPath "test\PosterTextless.jpg"
    }

    # Season Posters
    if ($AddText -eq 'true') {
        $TestSeasonPosterShort = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterShortText.jpg"
        $TestSeasonPosterMedium = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterMediumText.jpg"
        $TestSeasonPosterLong = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterLongText.jpg"
        $TestSeasonPosterShortCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterShortTextCAPS.jpg"
        $TestSeasonPosterMediumCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterMediumTextCAPS.jpg"
        $TestSeasonPosterLongCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterLongTextCAPS.jpg"
    }
    Else {
        $TestSeasonPosterTextless = Join-Path -Path $global:ScriptRoot -ChildPath "test\SeasonPosterTextless.jpg"
    }
    # Backgrounds
    if ($AddBackgroundText -eq 'True') {
        $backgroundTestPosterShort = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundShortText.jpg"
        $backgroundTestPosterMedium = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundMediumText.jpg"
        $backgroundTestPosterLong = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundLongText.jpg"
        $backgroundTestPosterShortCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundShortTextCAPS.jpg"
        $backgroundTestPosterMediumCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundMediumTextCAPS.jpg"
        $backgroundTestPosterLongCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\backgroundLongTextCAPS.jpg"
    }
    Else {
        $BackgroundTestPosterTextless = Join-Path -Path $global:ScriptRoot -ChildPath "test\BackgroundTextless.jpg"
    }

    # TitleCards
    if ($AddTitleCardEPTitleText -eq 'True' -or $AddTitleCardEPText -eq 'True') {
        $TitleCardTestPosterShort = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardShortText.jpg"
        $TitleCardTestPosterMedium = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardMediumText.jpg"
        $TitleCardTestPosterLong = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardLongText.jpg"
        $TitleCardTestPosterShortCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardShortTextCAPS.jpg"
        $TitleCardTestPosterMediumCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardMediumTextCAPS.jpg"
        $TitleCardTestPosterLongCAPS = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardLongTextCAPS.jpg"
    }
    Else {
        $TitleCardTestPosterTextless = Join-Path -Path $global:ScriptRoot -ChildPath "test\TitleCardTextless.jpg"
    }

    if ($AddText -eq 'true' -or $AddBackgroundText -eq 'True' -or $AddTitleCardEPTitleText -eq 'True' -or $AddTitleCardEPText -eq 'True') {
        Write-Entry -Subtext "Calculating Optimal Font Sizes. This may take a while..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    $TruncatedCount = 0
    # Optimal Poster Font Size
    if ($AddText -eq 'true') {
        $optimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $optimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $optimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }

        $optimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $optimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $optimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        Write-Entry -Subtext "Finished Optimal Font Sizes for posters..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    # Optimal Season Poster Font Size
    if ($AddSeasonText -eq 'true') {
        $seasonoptimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $seasonoptimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $seasonoptimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }

        $seasonoptimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $seasonoptimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $seasonoptimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        Write-Entry -Subtext "Finished Optimal Font Sizes for season posters..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    # Optimal Background Font Size
    if ($AddBackgroundText -eq 'True') {
        $backgroundoptimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $backgroundoptimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $backgroundoptimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }

        $backgroundoptimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $backgroundoptimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $backgroundoptimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $backgroundfontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        Write-Entry -Subtext "Finished Optimal Font Sizes for backgrounds..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }
    # Optimal TitleCard Font Size
    if ($AddTitleCardEPTitleText -eq 'True') {
        $TitleCardoptimalFontSizeShort = Get-OptimalPointSize -text $ShortText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeMedium = Get-OptimalPointSize -text $MediumText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeLong = Get-OptimalPointSize -text $LongText -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeShortCAPS = Get-OptimalPointSize -text $ShortTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeMediumCAPS = Get-OptimalPointSize -text $MediumTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeLongCAPS = Get-OptimalPointSize -text $LongTextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
    }
    # Optimal TitleCard EP Font Size
    if ($AddTitleCardEPText -eq 'True') {
        $Episodetext = $Episodetext -replace '"', '""'
        $TitleCardoptimalFontSizeEpisodetext = Get-OptimalPointSize -text $Episodetext -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
        $EpisodetextCAPS = $EpisodetextCAPS -replace '"', '""'
        $TitleCardoptimalFontSizeEpisodetextCAPS = Get-OptimalPointSize -text $EpisodetextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
        if ($global:IsTruncated) { $TruncatedCount++ }
    }
    if ($AddText -eq 'true' -or $AddBackgroundText -eq 'True' -or $AddTitleCardEPTitleText -eq 'True' -or $AddTitleCardEPText -eq 'True') {
        Write-Entry -Subtext "Finished Optimal Font Sizes for titlecards..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color Cyan -log Info
    }

    # Border/Overlay Poster Part

    Write-Entry -Subtext "Poster Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Color Green -log Info
    if ($AddText -eq 'true') {
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $ArgumentsShort = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $ArgumentsShort = "`"$testimage`" -quality $global:outputQuality `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" -quality $global:outputQuality `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" -quality $global:outputQuality `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterLongCAPS`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }

        # Poster Logging
        $logEntryShort = "`"$magick`" $ArgumentsShort"
        $logEntryMedium = "`"$magick`" $ArgumentsMedium"
        $logEntryLong = "`"$magick`" $ArgumentsLong"
        $logEntryShortCAPS = "`"$magick`" $ArgumentsShortCAPS"
        $logEntryMediumCAPS = "`"$magick`" $ArgumentsMediumCAPS"
        $logEntryLongCAPS = "`"$magick`" $ArgumentsLongCAPS"

        $logEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Test Poster creation
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsLongCAPS
    }
    Else {
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $ArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $ArgumentsTextless = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $ArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $ArgumentsTextless = "`"$testimage`" -quality $global:outputQuality `"$TestPosterTextless`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        $PosterlogEntryTextless = "`"$magick`" $ArgumentsTextless"
        $PosterlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsTextless
    }
    # Text Poster overlay
    if ($AddText -eq 'true') {
        # Logging Poster
        Write-Entry -Subtext "Optimal font size for Short text is: '$optimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium text is: '$optimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long text is: '$optimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        Write-Entry -Subtext "Optimal font size for Short CAPS text is: '$optimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium CAPS text is: '$optimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long CAPS text is: '$optimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        $ArgumentsShort = "`"$TestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShort`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterShort`""
        $ArgumentsMedium = "`"$TestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMedium`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterMedium`""
        $ArgumentsLong = "`"$TestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLong`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterLong`""
        $ArgumentsShortCAPS = "`"$TestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterShortCAPS`""
        $ArgumentsMediumCAPS = "`"$TestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterMediumCAPS`""
        $ArgumentsLongCAPS = "`"$TestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$boxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$boxsize`" ) -gravity south -geometry +0+`"$text_offset`" -quality $global:outputQuality -composite `"$TestPosterLongCAPS`""

        # Text Poster Logging
        $logEntryShort = "`"$magick`" $ArgumentsShort"
        $logEntryMedium = "`"$magick`" $ArgumentsMedium"
        $logEntryLong = "`"$magick`" $ArgumentsLong"
        $logEntryShortCAPS = "`"$magick`" $ArgumentsShortCAPS"
        $logEntryMediumCAPS = "`"$magick`" $ArgumentsMediumCAPS"
        $logEntryLongCAPS = "`"$magick`" $ArgumentsLongCAPS"

        $logEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $logEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Text Poster overlaying
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsLongCAPS
    }
    Else {
        Write-Entry -Subtext "    Applying textbox only to Poster..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $ArgumentsNoText = "`"$TestPosterTextless`" -size `"$boxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$text_offset`" -compose over -composite `"$TestPosterTextless`""
        InvokeMagickCommand -Command $magick -Arguments $ArgumentsNoText
    }

    # Border/Overlay Season Poster Part

    Write-Entry -Subtext "Season Poster Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Color Green -log Info
    if ($AddSeasonText -eq 'true') {
        if ($AddSeasonBorder -eq 'true' -and $AddSeasonOverlay -eq 'true') {
            $SeasonArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterShort`""
            $SeasonArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterMedium`""
            $SeasonArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterLong`""
            $SeasonArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterShortCAPS`""
            $SeasonArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterMediumCAPS`""
            $SeasonArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterLongCAPS`""
            Write-Entry -Subtext "Adding Season Poster Borders | Adding Season Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddSeasonBorder -eq 'true' -and $AddSeasonOverlay -eq 'false') {
            $SeasonArgumentsShort = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterShort`""
            $SeasonArgumentsMedium = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterMedium`""
            $SeasonArgumentsLong = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterLong`""
            $SeasonArgumentsShortCAPS = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterShortCAPS`""
            $SeasonArgumentsMediumCAPS = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterMediumCAPS`""
            $SeasonArgumentsLongCAPS = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterLongCAPS`""
            Write-Entry -Subtext "Adding Season Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddSeasonBorder -eq 'false' -and $AddSeasonOverlay -eq 'true') {
            $SeasonArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterShort`""
            $SeasonArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterMedium`""
            $SeasonArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterLong`""
            $SeasonArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterShortCAPS`""
            $SeasonArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterMediumCAPS`""
            $SeasonArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterLongCAPS`""
            Write-Entry -Subtext "Adding Season Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddSeasonBorder -eq 'false' -and $AddSeasonOverlay -eq 'false') {
            $SeasonArgumentsShort = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterShort`""
            $SeasonArgumentsMedium = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterMedium`""
            $SeasonArgumentsLong = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterLong`""
            $SeasonArgumentsShortCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterShortCAPS`""
            $SeasonArgumentsMediumCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterMediumCAPS`""
            $SeasonArgumentsLongCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterLongCAPS`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }

        # Poster Logging
        $SeasonlogEntryShort = "`"$magick`" $SeasonArgumentsShort"
        $SeasonlogEntryMedium = "`"$magick`" $SeasonArgumentsMedium"
        $SeasonlogEntryLong = "`"$magick`" $SeasonArgumentsLong"
        $SeasonlogEntryShortCAPS = "`"$magick`" $SeasonArgumentsShortCAPS"
        $SeasonlogEntryMediumCAPS = "`"$magick`" $SeasonArgumentsMediumCAPS"
        $SeasonlogEntryLongCAPS = "`"$magick`" $SeasonArgumentsLongCAPS"

        $SeasonlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Test Poster creation
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsLongCAPS
    }
    Else {
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $SeasonArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterTextless`""
            Write-Entry -Subtext "Adding Season Poster Borders | Adding Season Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $SeasonArgumentsTextless = "`"$testimage`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$TestSeasonPosterTextless`""
            Write-Entry -Subtext "Adding Season Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $SeasonArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestSeasonPosterTextless`""
            Write-Entry -Subtext "Adding Season Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $SeasonArgumentsTextless = "`"$testimage`" -quality $global:outputQuality `"$TestSeasonPosterTextless`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        $PosterlogEntryTextless = "`"$magick`" $SeasonArgumentsTextless"
        $PosterlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsTextless
    }
    # Text Poster overlay
    if ($AddSeasonText -eq 'true') {
        # Logging Poster
        Write-Entry -Subtext "Optimal font size for Short text is: '$optimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium text is: '$optimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long text is: '$optimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        Write-Entry -Subtext "Optimal font size for Short CAPS text is: '$optimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium CAPS text is: '$optimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long CAPS text is: '$optimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        $SeasonArgumentsShort = "`"$TestSeasonPosterShort`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShort`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterShort`""
        $SeasonArgumentsMedium = "`"$TestSeasonPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMedium`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterMedium`""
        $SeasonArgumentsLong = "`"$TestSeasonPosterLong`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLong`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterLong`""
        $SeasonArgumentsShortCAPS = "`"$TestSeasonPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterShortCAPS`""
        $SeasonArgumentsMediumCAPS = "`"$TestSeasonPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterMediumCAPS`""
        $SeasonArgumentsLongCAPS = "`"$TestSeasonPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$fontImagemagick`" -pointsize `"$optimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$Seasonboxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$Seasonboxsize`" ) -gravity south -geometry +0+`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$TestSeasonPosterLongCAPS`""

        # Text Poster Logging
        $SeasonlogEntryShort = "`"$magick`" $SeasonArgumentsShort"
        $SeasonlogEntryMedium = "`"$magick`" $SeasonArgumentsMedium"
        $SeasonlogEntryLong = "`"$magick`" $SeasonArgumentsLong"
        $SeasonlogEntryShortCAPS = "`"$magick`" $SeasonArgumentsShortCAPS"
        $SeasonlogEntryMediumCAPS = "`"$magick`" $SeasonArgumentsMediumCAPS"
        $SeasonlogEntryLongCAPS = "`"$magick`" $SeasonArgumentsLongCAPS"

        $SeasonlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $SeasonlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Text Poster overlaying
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsLongCAPS
    }
    Else {
        Write-Entry -Subtext "    Applying textbox only to Season Poster..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $SeasonArgumentsNoText = "`"$TestSeasonPosterTextless`" -size `"$Seasonboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$Seasontext_offset`" -compose over -composite `"$TestSeasonPosterTextless`""
        InvokeMagickCommand -Command $magick -Arguments $SeasonArgumentsNoText
    }

    Write-Entry -Subtext "Background Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Color Green -log Info
    # Border/Overlay Background Part
    if ($AddBackgroundText -eq 'true') {
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterLongCAPS`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        # Background Logging
        $backgroundlogEntryShort = "`"$magick`" $backgroundArgumentsShort"
        $backgroundlogEntryMedium = "`"$magick`" $backgroundArgumentsMedium"
        $backgroundlogEntryLong = "`"$magick`" $backgroundArgumentsLong"
        $backgroundlogEntryShortCAPS = "`"$magick`" $backgroundArgumentsShortCAPS"
        $backgroundlogEntryMediumCAPS = "`"$magick`" $backgroundArgumentsMediumCAPS"
        $backgroundlogEntryLongCAPS = "`"$magick`" $backgroundArgumentsLongCAPS"

        $backgroundlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Test Background creation
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsLongCAPS
    }
    Else {
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$BackgroundTestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$BackgroundTestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$BackgroundTestPosterTextless`""
            Write-Entry -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" -quality $global:outputQuality `"$BackgroundTestPosterTextless`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        $BackgroundlogEntryTextless = "`"$magick`" $BackgroundArgumentsTextless"
        $BackgroundlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $BackgroundArgumentsTextless
    }
    # Text background overlay
    if ($AddBackgroundText -eq 'True') {
        # Logging Background
        Write-Entry -Subtext "Optimal font size for Short text is: '$backgroundoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium text is: '$backgroundoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long text is: '$backgroundoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        Write-Entry -Subtext "Optimal font size for Short CAPS text is: '$backgroundoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium CAPS text is: '$backgroundoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long CAPS text is: '$backgroundoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        $backgroundArgumentsShort = "`"$backgroundTestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeShort`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterShort`""
        $backgroundArgumentsMedium = "`"$backgroundTestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeMedium`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterMedium`""
        $backgroundArgumentsLong = "`"$backgroundTestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeLong`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterLong`""
        $backgroundArgumentsShortCAPS = "`"$backgroundTestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterShortCAPS`""
        $backgroundArgumentsMediumCAPS = "`"$backgroundTestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterMediumCAPS`""
        $backgroundArgumentsLongCAPS = "`"$backgroundTestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$backgroundfontImagemagick`" -pointsize `"$backgroundoptimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$Backgroundboxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$Backgroundboxsize`" ) -gravity south -geometry +0+`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundTestPosterLongCAPS`""
        # Text background Logging
        $backgroundlogEntryShort = "`"$magick`" $backgroundArgumentsShort"
        $backgroundlogEntryMedium = "`"$magick`" $backgroundArgumentsMedium"
        $backgroundlogEntryLong = "`"$magick`" $backgroundArgumentsLong"
        $backgroundlogEntryShortCAPS = "`"$magick`" $backgroundArgumentsShortCAPS"
        $backgroundlogEntryMediumCAPS = "`"$magick`" $backgroundArgumentsMediumCAPS"
        $backgroundlogEntryLongCAPS = "`"$magick`" $backgroundArgumentsLongCAPS"

        $backgroundlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $backgroundlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Text Background overlaying
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $backgroundArgumentsLongCAPS
    }
    Else {
        Write-Entry -Subtext "    Applying textbox only to Background..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $BackgroundArgumentsNoText = "`"$BackgroundTestPosterTextless`" -size `"$Backgroundboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$Backgroundtext_offset`" -compose over -composite `"$BackgroundTestPosterTextless`""
        InvokeMagickCommand -Command $magick -Arguments $BackgroundArgumentsNoText
    }
    Write-Entry -Subtext "TitleCard Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Color Green -log Info
    # Border/Overlay TitleCard Part
    if ($AddTitleCardEPTitleText -eq 'true' -or $AddTitleCardEPText -eq 'True') {
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'true') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'false') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'true') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterLongCAPS`""
            Write-Entry -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'false') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterLongCAPS`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        # TitleCard Logging
        $titlecardlogEntryShort = "`"$magick`" $titlecardArgumentsShort"
        $titlecardlogEntryMedium = "`"$magick`" $titlecardArgumentsMedium"
        $titlecardlogEntryLong = "`"$magick`" $titlecardArgumentsLong"
        $titlecardlogEntryShortCAPS = "`"$magick`" $titlecardArgumentsShortCAPS"
        $titlecardlogEntryMediumCAPS = "`"$magick`" $titlecardArgumentsMediumCAPS"
        $titlecardlogEntryLongCAPS = "`"$magick`" $titlecardArgumentsLongCAPS"

        $titlecardlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $titlecardlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $titlecardlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $titlecardlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $titlecardlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $titlecardlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Test TitleCards creation
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $titlecardArgumentsLongCAPS
    }
    Else {
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'true') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$TitleCardTestPosterTextless`""
            Write-Entry -Subtext "Adding TitleCard Borders | Adding TitleCard Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'false') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$TitleCardTestPosterTextless`""
            Write-Entry -Subtext "Adding TitleCard Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'true') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$TitleCardTestPosterTextless`""
            Write-Entry -Subtext "Adding TitleCard Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'false') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" -quality $global:outputQuality `"$TitleCardTestPosterTextless`""
            Write-Entry -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        }
        $titlecardlogEntryTextless = "`"$magick`" $TitleCardArgumentsTextless"
        $titlecardlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $TitleCardArgumentsTextless
    }

    # Text TitleCard Title overlay
    if ($AddTitleCardEPTitleText -eq 'True') {
        # Logging TitleCards
        Write-Entry -Subtext "Optimal font size for Short text is: '$titlecardoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium text is: '$titlecardoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long text is: '$titlecardoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Short CAPS text is: '$titlecardoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Medium CAPS text is: '$titlecardoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Long CAPS text is: '$titlecardoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        $TitleCardTitleArgumentsShort = "`"$titlecardtestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeShort`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$ShortText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterShort`""
        $TitleCardTitleArgumentsMedium = "`"$titlecardtestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeMedium`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$MediumText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterMedium`""
        $TitleCardTitleArgumentsLong = "`"$titlecardtestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeLong`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$LongText`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterLong`""
        $TitleCardTitleArgumentsShortCAPS = "`"$titlecardtestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeShortCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$ShortTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterShortCAPS`""
        $TitleCardTitleArgumentsMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeMediumCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$MediumTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterMediumCAPS`""
        $TitleCardTitleArgumentsLongCAPS = "`"$titlecardtestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeLongCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPTitleboxsize`" -background `"#ACD7E6`" caption:`"$LongTextCAPS`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterLongCAPS`""

        # Title Text Titlecard Logging
        $TitleCardTitlelogEntryShort = "`"$magick`" $TitleCardTitleArgumentsShort"
        $TitleCardTitlelogEntryMedium = "`"$magick`" $TitleCardTitleArgumentsMedium"
        $TitleCardTitlelogEntryLong = "`"$magick`" $TitleCardTitleArgumentsLong"
        $TitleCardTitlelogEntryshortCAPS = "`"$magick`" $TitleCardTitleArgumentsShortCAPS"
        $TitleCardTitlelogEntryMediumCAPS = "`"$magick`" $TitleCardTitleArgumentsMediumCAPS"
        $TitleCardTitlelogEntryLongCAPS = "`"$magick`" $TitleCardTitleArgumentsLongCAPS"
        $TitleCardTitlelogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Title Text TitleCard overlaying
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsLongCAPS
    }
    Elseif ($AddTitleCardEPTitleText -eq 'false' -and $AddTitleCardEPText -eq 'True') {
        Write-Entry -Subtext "    Applying Title textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $TitleCardEPTitleArgumentsNoTextShort = "`"$titlecardtestPosterShort`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterShort`""
        $TitleCardEPTitleArgumentsNoTextMedium = "`"$titlecardtestPosterMedium`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterMedium`""
        $TitleCardEPTitleArgumentsNoTextLong = "`"$titlecardtestPosterLong`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterLong`""
        $TitleCardEPTitleArgumentsNoTextShortCAPS = "`"$titlecardtestPosterShortCAPS`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterShortCAPS`""
        $TitleCardEPTitleArgumentsNoTextMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterMediumCAPS`""
        $TitleCardEPTitleArgumentsNoTextLongCAPS = "`"$titlecardtestPosterLongCAPS`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$titlecardtestPosterLongCAPS`""

        # Title Text Titlecard Logging
        $TitleCardTitlelogEntryShort = "`"$magick`" $TitleCardEPTitleArgumentsNoTextShort"
        $TitleCardTitlelogEntryMedium = "`"$magick`" $TitleCardEPTitleArgumentsNoTextMedium"
        $TitleCardTitlelogEntryLong = "`"$magick`" $TitleCardEPTitleArgumentsNoTextLong"
        $TitleCardTitlelogEntryshortCAPS = "`"$magick`" $TitleCardEPTitleArgumentsNoTextShortCAPS"
        $TitleCardTitlelogEntryMediumCAPS = "`"$magick`" $TitleCardEPTitleArgumentsNoTextMediumCAPS"
        $TitleCardTitlelogEntryLongCAPS = "`"$magick`" $TitleCardEPTitleArgumentsNoTextLongCAPS"
        $TitleCardTitlelogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardTitlelogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextShort
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextMedium
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextLong
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPTitleArgumentsNoTextLongCAPS
    }
    Else {
        Write-Entry -Subtext "    Applying Title textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $TitleCardTitleArgumentsNoText = "`"$TitleCardTestPosterTextless`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$TitleCardTestPosterTextless`""

        # Episode Text Titlecard Logging
        $TitleCardEPTitlelogEntryNoText = "`"$magick`" $TitleCardTitleArgumentsNoText"
        $TitleCardEPTitlelogEntryNoText | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $TitleCardTitleArgumentsNoText
    }
    # Text TitleCard EP overlay
    if ($AddTitleCardEPText -eq 'True') {
        Write-Entry -Subtext "Optimal font size for Episode CAPS text is: '$TitleCardoptimalFontSizeEpisodetextCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying CAPS text: `"$EpisodetextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "Optimal font size for Episode text is: '$TitleCardoptimalFontSizeEpisodetext'" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        Write-Entry -Subtext "    Applying text: `"$Episodetext`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info

        $TitleCardEPArgumentsShort = "`"$titlecardtestPosterShort`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterShort`""
        $TitleCardEPArgumentsMedium = "`"$titlecardtestPosterMedium`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterMedium`""
        $TitleCardEPArgumentsLong = "`"$titlecardtestPosterLong`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetext`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$Episodetext`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterLong`""
        $TitleCardEPArgumentsShortCAPS = "`"$titlecardtestPosterShortCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterShortCAPS`""
        $TitleCardEPArgumentsMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterMediumCAPS`""
        $TitleCardEPArgumentsLongCAPS = "`"$titlecardtestPosterLongCAPS`" -gravity center -background none -layers Flatten ( -font `"$titlecardfontImagemagick`" -pointsize `"$TitleCardoptimalFontSizeEpisodetextCAPS`" -fill `"#0000FF`" -size `"$TitleCardEPboxsize`" -background `"#ACD7E6`" caption:`"$EpisodetextCAPS`" -trim -gravity south -extent `"$TitleCardEPboxsize`" ) -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$titlecardtestPosterLongCAPS`""

        # Episode Text Titlecard Logging
        $TitleCardEPlogEntryShort = "`"$magick`" $TitleCardEPArgumentsShort"
        $TitleCardEPlogEntryMedium = "`"$magick`" $TitleCardEPArgumentsMedium"
        $TitleCardEPlogEntryLong = "`"$magick`" $TitleCardEPArgumentsLong"
        $TitleCardEPlogEntryshortCAPS = "`"$magick`" $TitleCardEPArgumentsShortCAPS"
        $TitleCardEPlogEntryMediumCAPS = "`"$magick`" $TitleCardEPArgumentsMediumCAPS"
        $TitleCardEPlogEntryLongCAPS = "`"$magick`" $TitleCardEPArgumentsLongCAPS"
        $TitleCardEPlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        # Episode Text TitleCard overlaying
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsShort
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsMedium
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsLong
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsLongCAPS
    }
    Elseif ($AddTitleCardEPText -eq 'false' -and $AddTitleCardEPTitleText -eq 'True') {
        Write-Entry -Subtext "    Applying EP textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $TitleCardEPArgumentsNoTextShort = "`"$titlecardtestPosterShort`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterShort`""
        $TitleCardEPArgumentsNoTextMedium = "`"$titlecardtestPosterMedium`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterMedium`""
        $TitleCardEPArgumentsNoTextLong = "`"$titlecardtestPosterLong`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterLong`""
        $TitleCardEPArgumentsNoTextShortCAPS = "`"$titlecardtestPosterShortCAPS`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterShortCAPS`""
        $TitleCardEPArgumentsNoTextMediumCAPS = "`"$titlecardtestPosterMediumCAPS`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterMediumCAPS`""
        $TitleCardEPArgumentsNoTextLongCAPS = "`"$titlecardtestPosterLongCAPS`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$titlecardtestPosterLongCAPS`""

        # Episode Text Titlecard Logging
        $TitleCardEPlogEntryShort = "`"$magick`" $TitleCardEPArgumentsNoTextShort"
        $TitleCardEPlogEntryMedium = "`"$magick`" $TitleCardEPArgumentsNoTextMedium"
        $TitleCardEPlogEntryLong = "`"$magick`" $TitleCardEPArgumentsNoTextLong"
        $TitleCardEPlogEntryshortCAPS = "`"$magick`" $TitleCardEPArgumentsNoTextShortCAPS"
        $TitleCardEPlogEntryMediumCAPS = "`"$magick`" $TitleCardEPArgumentsNoTextMediumCAPS"
        $TitleCardEPlogEntryLongCAPS = "`"$magick`" $TitleCardEPArgumentsNoTextLongCAPS"
        $TitleCardEPlogEntryShort | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryShortCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryMedium | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryMediumCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryLong | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        $TitleCardEPlogEntryLongCAPS | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append

        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextShort
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextMedium
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextLong
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextShortCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextMediumCAPS
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoTextLongCAPS
    }
    Else {
        Write-Entry -Subtext "    Applying EP textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Color White -log Info
        $TitleCardEPArgumentsNoText = "`"$TitleCardTestPosterTextless`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$TitleCardTestPosterTextless`""

        # Episode Text Titlecard Logging
        $TitleCardEPlogEntryNoText = "`"$magick`" $TitleCardEPArgumentsNoText"
        $TitleCardEPlogEntryNoText | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
        InvokeMagickCommand -Command $magick -Arguments $TitleCardEPArgumentsNoText
    }


    $endTime = Get-Date
    $executionTime = New-TimeSpan -Start $startTime -End $endTime
    # Format the execution time
    $hours = [math]::Floor($executionTime.TotalHours)
    $minutes = $executionTime.Minutes
    $seconds = $executionTime.Seconds
    $FormattedTimespawn = $hours.ToString() + "h " + $minutes.ToString() + "m " + $seconds.ToString() + "s "
    Write-Entry -Subtext "Final cleanup starting..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
    Write-Entry -Subtext "Deleting testimage: $testimage" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    Remove-Item -LiteralPath $testimage | out-null
    Write-Entry -Subtext "Deleting backgroundtestimage: $backgroundtestimage" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    Remove-Item -LiteralPath $backgroundtestimage | out-null
    Write-Entry -Subtext "Poster/Background/TitleCard Tests finished, you can find them here: $(Join-Path $global:ScriptRoot 'test')" -Path (Join-Path $global:ScriptRoot 'Logs\Testinglog.log') -Color Green -log Info
    Write-Entry -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Testinglog.log -Color Green -log Info
    $gettestimages = Get-ChildItem $global:ScriptRoot\test
    $titlecardscount = ($gettestimages | Where-Object { $_.name -like 'Title*' }).count
    $backgroundsscount = ($gettestimages | Where-Object { $_.name -like 'back*' }).count
    $posterscount = ($gettestimages | Where-Object { $_.name -like 'poster*' -or $_.name -like 'SeasonPoster*' }).count
    if ($global:NotifyUrl -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -notlike 'PSDocker-Alpine*') {
        $jsonPayload = @"
        {
            "username": "Plex-Poster-Maker",
            "avatar_url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png",
            "content": "",
            "embeds": [
            {
                "author": {
                "name": "PPM @Github",
                "url": "https://github.com/fscorrupt/Plex-Poster-Maker"
                },
                "description": "PPM Test run took: $FormattedTimespawn",
                "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                "color": $(if ($errorCount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                "fields": [
                {
                    "name": "",
                    "value": ":bar_chart:",
                    "inline": false
                },
                {
                    "name": "Truncated",
                    "value": "$TruncatedCount",
                    "inline": false
                },
                {
                    "name": "",
                    "value": ":frame_photo:",
                    "inline": false
                },
                {
                    "name": "Posters",
                    "value": "$posterscount",
                    "inline": true
                },
                {
                    "name": "Backgrounds",
                    "value": "$backgroundsscount",
                    "inline": true
                },
                {
                    "name": "TitleCards",
                    "value": "$titlecardscount",
                    "inline": true
                }
                ],
                "thumbnail": {
                    "url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png"
                },
                "footer": {
                    "text": "$Platform  | current - v$CurrentScriptVersion  | latest - v$LatestScriptVersion"
                }

            }
            ]
        }
"@
        if ($global:SendNotification -eq 'True') {
            Push-ObjectToDiscord -strDiscordWebhook $global:NotifyUrl -objPayload $jsonPayload
        }
    }
    if ($global:NotifyUrl -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
        if ($global:NotifyUrl -like '*discord*') {
            $jsonPayload = @"
            {
                "username": "Plex-Poster-Maker",
                "avatar_url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png",
                "content": "",
                "embeds": [
                {
                    "author": {
                    "name": "PPM @Github",
                    "url": "https://github.com/fscorrupt/Plex-Poster-Maker"
                    },
                    "description": "PPM Test run took: $FormattedTimespawn",
                    "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                    "color": $(if ($errorCount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                    "fields": [
                    {
                        "name": "",
                        "value": ":bar_chart:",
                        "inline": false
                    },
                    {
                        "name": "Truncated",
                        "value": "$TruncatedCount",
                        "inline": false
                    },
                    {
                        "name": "",
                        "value": ":frame_photo:",
                        "inline": false
                    },
                    {
                        "name": "Posters",
                        "value": "$posterscount",
                        "inline": true
                    },
                    {
                        "name": "Backgrounds",
                        "value": "$backgroundsscount",
                        "inline": true
                    },
                    {
                        "name": "TitleCards",
                        "value": "$titlecardscount",
                        "inline": true
                    }
                    ],
                    "thumbnail": {
                        "url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png"
                    },
                    "footer": {
                        "text": "$Platform  | current - v$CurrentScriptVersion  | latest - v$LatestScriptVersion"
                    }

                }
                ]
            }
"@
            $global:NotifyUrl = $global:NotifyUrl.replace('discord://', 'https://discord.com/api/webhooks/')
            if ($global:SendNotification -eq 'True') {
                Push-ObjectToDiscord -strDiscordWebhook $global:NotifyUrl -objPayload $jsonPayload
            }
        }
        Else {
            if ($global:SendNotification -eq 'True') {
                if ($TruncatedCount -ge '1') {
                    apprise --notification-type="error" --title="Plex-Poster-Maker" --body="PPM test run took: $FormattedTimespawn`nDuring execution '$TruncatedCount' times the text got truncated, please check log for detailed description." "$global:NotifyUrl"
                }
                Else {
                    apprise --notification-type="success" --title="Plex-Poster-Maker" --body="PPM test run took: $FormattedTimespawn" "$global:NotifyUrl"
                }
            }
        }
    }
}
else {
    Write-Entry -Message "Query plex libs..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    $Libsoverview = @()
    foreach ($lib in $Libs.MediaContainer.Directory) {
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
            # Check if Libname has chars we cant use for Folders
            if ($lib.title -notmatch "^[^\/:*?`"<>\|\\}]+$") {
                Write-Entry -Message  "Lib: '$($lib.title)' contains invalid characters." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "Please rename your lib and remove all chars that are listed here: '/, :, *, ?, `", <, >, |, \, or }'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                Exit
            }
            $Libsoverview += $libtemp
        }
    }
    if ($($Libsoverview.count) -lt 1) {
        Write-Entry -Subtext "0 libraries were found. Are you on the correct Plex server?" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Exit
    }
    Write-Entry -Subtext "Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    $IncludedLibraryNames = $Libsoverview.Name -join ', '
    Write-Entry -Subtext "Included Libraries: $IncludedLibraryNames" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    Write-Entry -Message "Query all items from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    $Libraries = @()
    Foreach ($Library in $Libsoverview) {
        if ($Library.Name -notin $LibstoExclude) {
            $PlexHeaders = @{}
            if ($PlexToken) {
                $PlexHeaders['X-Plex-Token'] = $PlexToken
            }

            # Create a parent XML document
            $Libcontent = New-Object -TypeName System.Xml.XmlDocument
            $mediaContainerNode = $Libcontent.CreateElement('MediaContainer')
            $Libcontent.AppendChild($mediaContainerNode) | Out-Null

            # Initialize variables for pagination
            $searchsize = 0
            $totalContentSize = 1

            # Loop until all content is retrieved
            do {
                # Set headers for the current request
                $PlexHeaders['X-Plex-Container-Start'] = $searchsize
                $PlexHeaders['X-Plex-Container-Size'] = '1000'

                # Fetch content from Plex server
                $response = Invoke-WebRequest -Uri "$PlexUrl/library/sections/$($Library.ID)/all" -Headers $PlexHeaders

                # Convert response content to XML
                [xml]$additionalContent = $response.Content

                # Get total content size if not retrieved yet
                if ($totalContentSize -eq 1) {
                    $totalContentSize = $additionalContent.MediaContainer.totalSize
                }

                # Import and append video nodes to the parent XML document
                $contentquery = if ($additionalContent.MediaContainer.video) {
                    'video'
                }
                else {
                    'Directory'
                }
                foreach ($videoNode in $additionalContent.MediaContainer.$contentquery) {
                    $importedNode = $Libcontent.ImportNode($videoNode, $true)
                    [void]$mediaContainerNode.AppendChild($importedNode)
                }

                # Update search size for next request
                $searchsize += [int]$additionalContent.MediaContainer.Size
            } until ($searchsize -ge $totalContentSize)
            if ($Libcontent.MediaContainer.video) {
                $contentquery = 'video'
            }
            Else {
                $contentquery = 'Directory'
            }
            foreach ($item in $Libcontent.MediaContainer.$contentquery) {
                $extractedFolder = $null
                $Seasondata = $null
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken -Headers $extraPlexHeaders).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children?X-Plex-Token=$PlexToken -Headers $extraPlexHeaders).content
                    }
                    Else {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)?X-Plex-Token=$PlexToken -Headers $extraPlexHeaders).content
                    }
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey) -Headers $extraPlexHeaders).content
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey)/children? -Headers $extraPlexHeaders).content
                    }
                    Else {
                        [xml]$Metadata = (Invoke-WebRequest $PlexUrl/library/metadata/$($item.ratingKey) -Headers $extraPlexHeaders).content
                    }
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
                    Write-Entry -Subtext "Plex Lib Paths before split: $($Library.path)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    Write-Entry -Subtext "Plex Lib Paths after split: $libpaths" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath/*" -or $location -like "$libpath\*") {
                            Write-Entry -Subtext "Location: $location" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            Write-Entry -Subtext "Libpath: $libpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                            if ($extractedFolder -like '*\*') {
                                $extractedFolder = $extractedFolder.split('\')[0]
                            }
                            if ($extractedFolder -like '*/*') {
                                $extractedFolder = $extractedFolder.split('/')[0]
                            }
                            Write-Entry -Subtext "Matchedpath: $Matchedpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            Write-Entry -Subtext "ExtractedFolder: $extractedFolder" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            break
                        }
                    }
                }
                Else {
                    $location = $Metadata.MediaContainer.$contentquery.media.part.file

                    if ($location.count -gt '1') {
                        Write-Entry -Subtext "Multi File Locations: $location" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                        $location = $location[0]
                        $MultipleVersions = $true
                    }
                    Else {
                        $MultipleVersions = $false
                    }
                    Write-Entry -Subtext "File Location: $location" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug

                    if ($location.length -ge '256' -and $Platform -eq 'Windows') {
                        $CheckCharLimit = CheckCharLimit
                        if ($CheckCharLimit -eq $false) {
                            Write-Entry -Subtext "Skipping [$($item.title)] because path length is over '256'..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            Write-Entry -Subtext "You can adjust it by following this: https://learn.microsoft.com/en-us/windows/win32/fileio/maximum-file-path-limitation?tabs=registry#enable-long-paths-in-windows-10-version-1607-and-later" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            continue
                        }
                    }

                    $libpaths = $($Library.path).split(',')
                    Write-Entry -Subtext "Plex Lib Paths before split: $($Library.path)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    Write-Entry -Subtext "Plex Lib Paths after split: $libpaths" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    foreach ($libpath in $libpaths) {
                        if ($location -like "$libpath/*" -or $location -like "$libpath\*") {
                            Write-Entry -Subtext "Location: $location" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            Write-Entry -Subtext "Libpath: $libpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            $Matchedpath = AddTrailingSlash $libpath
                            $libpath = $Matchedpath
                            $extractedFolder = $location.Substring($libpath.Length)
                            if ($extractedFolder -like '*\*') {
                                $extractedFolder = $extractedFolder.split('\')[0]
                            }
                            if ($extractedFolder -like '*/*') {
                                $extractedFolder = $extractedFolder.split('/')[0]
                            }
                            Write-Entry -Subtext "Matchedpath: $Matchedpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            Write-Entry -Subtext "ExtractedFolder: $extractedFolder" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                            break
                        }
                    }
                }
                if ($Seasondata) {
                    $SeasonsTemp = $Seasondata.MediaContainer.Directory | Where-Object { $_.Title -ne 'All episodes' }
                    $SeasonNames = $SeasonsTemp.Title -join ','
                    $SeasonNumbers = $SeasonsTemp.index -join ','
                    $SeasonRatingkeys = $SeasonsTemp.ratingKey -join ','
                    $SeasonPosterUrl = ($SeasonsTemp | Where-Object { $_.type -eq "season" }).thumb -join ','
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
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonNumbers" -Value $SeasonNumbers
                $temp | Add-Member -MemberType NoteProperty -Name "SeasonRatingKeys" -Value $SeasonRatingkeys
                $temp | Add-Member -MemberType NoteProperty -Name "year" -Value $item.year
                $temp | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $tvdbid
                $temp | Add-Member -MemberType NoteProperty -Name "imdbid" -Value $imdbid
                $temp | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $tmdbid
                $temp | Add-Member -MemberType NoteProperty -Name "ratingKey" -Value $item.ratingKey
                $temp | Add-Member -MemberType NoteProperty -Name "Path" -Value $Matchedpath
                $temp | Add-Member -MemberType NoteProperty -Name "RootFoldername" -Value $extractedFolder
                $temp | Add-Member -MemberType NoteProperty -Name "MultipleVersions" -Value $MultipleVersions
                $temp | Add-Member -MemberType NoteProperty -Name "PlexPosterUrl" -Value $Metadata.MediaContainer.$contentquery.thumb
                $temp | Add-Member -MemberType NoteProperty -Name "PlexBackgroundUrl" -Value $Metadata.MediaContainer.$contentquery.art
                $temp | Add-Member -MemberType NoteProperty -Name "PlexSeasonUrls" -Value $SeasonPosterUrl
                $Libraries += $temp
                Write-Entry -Subtext "Found [$($temp.title)] of type $($temp.{Library Type}) in [$($temp.{Library Name})]" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
            }
        }
    }
    Write-Entry -Subtext "Found '$($Libraries.count)' Items..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    $Libraries | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
    Write-Entry -Message "Export everything to a csv: $global:ScriptRoot\Logs\PlexLibexport.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

    # Initialize counter variable
    $posterCount = 0
    $SeasonCount = 0
    $EpisodeCount = 0
    $BackgroundCount = 0
    $PosterUnknownCount = 0
    $AllShows = $Libraries | Where-Object { $_.'Library Type' -eq 'show' }
    $AllMovies = $Libraries | Where-Object { $_.'Library Type' -eq 'movie' }

    # Getting information of all Episodes
    if ($global:TitleCards -eq 'True') {
        Write-Entry -Message "Query episodes data from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        # Query episode info
        $Episodedata = @()
        foreach ($showentry in $AllShows) {
            # Getting child entries for each season
            $splittedkeys = $showentry.SeasonRatingKeys.split(',')
            foreach ($key in $splittedkeys) {
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children?X-Plex-Token=$PlexToken -Headers $extraPlexHeaders).content
                    }
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children? -Headers $extraPlexHeaders).content
                    }
                }
                $tempseasondata = New-Object psobject
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Show Name" -Value $Seasondata.MediaContainer.grandparentTitle
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Type" -Value $Seasondata.MediaContainer.viewGroup
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $showentry.tvdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $showentry.tmdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Library Name" -Value $showentry.'Library Name'
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Season Number" -Value $Seasondata.MediaContainer.parentIndex
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Episodes" -Value $($Seasondata.MediaContainer.video.index -join ',')
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Seasondata.MediaContainer.video.title -join ';')
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "PlexTitleCardUrls" -Value $($Seasondata.MediaContainer.video.thumb -join ',')
                $Episodedata += $tempseasondata
                Write-Entry -Subtext "Found [$($tempseasondata.{Show Name})] of type $($tempseasondata.Type) for season $($tempseasondata.{Season Number})" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
            }
        }
        $Episodedata | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexEpisodeExport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        if ($Episodedata) {
            Write-Entry -Subtext "Found '$($Episodedata.Episodes.split(',').count)' Episodes..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
        }
    }

    # Test if csv´s are missing and create dummy file.
    if (!(Get-ChildItem -LiteralPath "$global:ScriptRoot\Logs\PlexEpisodeExport.csv" -ErrorAction SilentlyContinue)) {
        $EpisodeDummycsv = New-Object psobject

        # Add members to the object with empty values
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Show Name" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Type" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Library Name" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Season Number" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Episodes" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "Title" -Value $null
        $EpisodeDummycsv | Add-Member -MemberType NoteProperty -Name "PlexTitleCardUrls" -Value $null

        $EpisodeDummycsv | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexEpisodeExport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        Write-Entry -Message "No PlexEpisodeExport.csv found, creating dummy file for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
    if (!(Get-ChildItem -LiteralPath "$global:ScriptRoot\Logs\PlexLibexport.csv" -ErrorAction SilentlyContinue)) {
        # Add members to the object with empty values
        $PlexLibDummycsv = New-Object psobject
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "Library Name" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "Library Type" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "title" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "originalTitle" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "SeasonNames" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "SeasonNumbers" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "SeasonRatingKeys" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "year" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "imdbid" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "ratingKey" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "Path" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "RootFoldername" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "MultipleVersions" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "PlexPosterUrl" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "PlexBackgroundUrl" -Value $null
        $PlexLibDummycsv | Add-Member -MemberType NoteProperty -Name "PlexSeasonUrls" -Value $null

        $PlexLibDummycsv | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        Write-Entry -Message "No PlexLibexport.csv found, creating dummy file for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
    # Store all Files from asset dir in a hashtable
    Write-Entry -Message "Creating Hashtable of all posters in asset dir..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    try {
        $directoryHashtable = @{}
        $allowedExtensions = @(".jpg", ".jpeg", ".png", ".bmp")

        Get-ChildItem -Path $AssetPath -Recurse | ForEach-Object {
            if ($allowedExtensions -contains $_.Extension.ToLower()) {
                $directory = $_.Directory
                $basename = $_.BaseName
                if ($Platform -eq "Docker" -or $Platform -eq "Linux") {
                    $directoryHashtable["$directory/$basename"] = $true
                }
                Else {
                    $directoryHashtable["$directory\$basename"] = $true
                }
            }
        }
        Write-Entry -Subtext "Hashtable created..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
        Write-Entry -Subtext "Found: '$($directoryHashtable.count)' images in asset directory." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
    }
    catch {
        Write-Entry -Subtext "Error during Hashtable creation, please check Asset dir is available..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
        Exit
    }
    if ($global:logLevel -eq '3') {
        Write-Entry -Message "Output hashtable..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        $directoryHashtable.keys | Out-File "$global:ScriptRoot\Logs\hashtable.log" -Force
    }
    # Download poster foreach movie
    Write-Entry -Message "Starting asset creation now, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    Write-Entry -Message "Starting Movie Poster Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
    # Movie Part
    foreach ($entry in $AllMovies) {
        try {
            if ($($entry.RootFoldername)) {
                $global:posterurl = $null
                $global:ImageMagickError = $null
                $global:TextlessPoster = $null
                $global:TMDBfallbackposterurl = $null
                $global:fanartfallbackposterurl = $null
                $global:IsFallback = $null
                $global:PlexartworkDownloaded = $null

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
                    $PosterImageoriginal = "$EntryDir\poster.jpg"
                    $TestPath = $EntryDir
                    $Testfile = "poster"

                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $PosterImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                    $TestPath = $AssetPath
                    $Testfile = $($entry.RootFoldername)
                }

                if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                    $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                }
                else {
                    $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                    if ($fullTestPath) {
                        $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                    }
                    Else {
                        $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                    }
                }
                Write-Entry -Message "Test Path is: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Test File is: $Testfile" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Resolved Full Test Path is: $fullTestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Resolved hash Test Path is: $hashtestpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                $PosterImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername).jpg"
                $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                # Now we can start the Poster Part
                if ($global:Posters -eq 'true') {
                    if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:posterurl = $null
                        $global:PosterWithText = $null
                        $global:AssetTextLang = $null
                        $global:TMDBAssetTextLang = $null
                        $global:FANARTAssetTextLang = $null
                        $global:TVDBAssetTextLang = $null
                        $global:TMDBAssetChangeUrl = $null
                        $global:FANARTAssetChangeUrl = $null
                        $global:TVDBAssetChangeUrl = $null
                        $global:Fallback = $null
                        $global:IsFallback = $null
                        $global:ImageMagickError = $null
                        if ($PlexToken) {
                            $Arturl = $plexurl + $entry.PlexPosterUrl + "?X-Plex-Token=$PlexToken"
                        }
                        Else {
                            $Arturl = $plexurl + $entry.PlexPosterUrl
                        }
                        Write-Entry -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        switch -Wildcard ($global:FavProvider) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartMoviePoster } }
                            'FANART' { $global:posterurl = GetFanartMoviePoster }
                            'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMoviePoster }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartMoviePoster } }
                            'PLEX' { if ($entry.PlexPosterUrl) { GetPlexArtwork -Type ' a Movie Poster' -ArtUrl $Arturl -TempImage $PosterImage } }
                            Default { $global:posterurl = GetFanartMoviePoster }
                        }
                        switch -Wildcard ($global:Fallback) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster } }
                            'FANART' { $global:posterurl = GetFanartMoviePoster }
                        }
                        if ($global:PreferTextless -eq 'True') {
                            if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                                $global:posterurl = $global:fanartfallbackposterurl
                                Write-Entry -Subtext "Took Fanart.tv Fallback poster because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                $global:IsFallback = $true
                            }
                            if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                                $global:posterurl = $global:TMDBfallbackposterurl
                                Write-Entry -Subtext "Took TMDB Fallback poster because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                $global:IsFallback = $true
                            }
                        }

                        if ($global:OnlyTextless) {
                            $global:posterurl = GetFanartMoviePoster
                            if (!$global:FavProvider -eq 'FANART'){
                                $global:IsFallback = $true
                            }
                        }

                        if (!$global:posterurl) {

                            $global:posterurl = GetTVDBMoviePoster
                            $global:IsFallback = $true
                            if (!$global:posterurl -and !$global:OnlyTextless) {
                                if ($entry.PlexPosterUrl) {
                                    GetPlexArtwork -Type ' a Movie Poster' -ArtUrl $Arturl -TempImage $PosterImage
                                    $global:IsFallback = $true
                                }
                                Else {
                                    Write-Entry -Subtext "Plex Poster Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                }
                            }
                            if (!$global:posterurl -and $global:imdbid -and !$global:OnlyTextless) {
                                Write-Entry -Subtext "Searching on IMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                $global:posterurl = GetIMDBPoster
                                $global:IsFallback = $true
                                if (!$global:posterurl) {
                                    Write-Entry -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                }
                            }
                        }

                        if ($fontAllCaps -eq 'true') {
                            $joinedTitle = $Titletext.ToUpper()
                        }
                        Else {
                            $joinedTitle = $Titletext
                        }
                        if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                            try {
                                if (!$global:PlexartworkDownloaded) {
                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage -ErrorAction Stop
                                }
                            }
                            catch {
                                $statusCode = $_.Exception.Response.StatusCode.value__
                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                $errorCount++
                            }
                            Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                if ($global:PosterWithText) {
                                    Write-Entry -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                }
                            }
                            elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                if ($global:PosterWithText) {
                                    Write-Entry -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                }
                            }
                            elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                Write-Entry -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TVDBAssetTextLang
                            }
                            elseif ($global:posterurl -like "$PlexUrl*") {
                                Write-Entry -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            }
                            if ($global:ImageProcessing -eq 'true') {
                                Write-Entry -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                $CommentArguments = "convert `"$PosterImage`" -set `"comment`" `"created with ppm`" `"$PosterImage`""
                                $CommentlogEntry = "`"$magick`" $CommentArguments"
                                $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                                if (!$global:ImageMagickError -eq 'True') {
                                    # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                                        Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    $logEntry = "`"$magick`" $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                    InvokeMagickCommand -Command $magick -Arguments $Arguments

                                    if ($AddText -eq 'true') {
                                        $joinedTitle = $joinedTitle -replace '"', '""'
                                        $joinedTitlePointSize = $joinedTitle -replace '""', '""""'
                                        $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                        if (!$global:IsTruncated) {
                                            Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
                                            Write-Entry -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            $logEntry = "`"$magick`" $Arguments"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                            InvokeMagickCommand -Command $magick -Arguments $Arguments
                                        }
                                    }
                                }
                            }
                            Else {
                                $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                                Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                $logEntry = "`"$magick`" $Resizeargument"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                            }
                            # Move file back to original naming with Brackets.
                            if (!$global:ImageMagickError -eq 'True') {
                                if (Get-ChildItem -LiteralPath $PosterImage -ErrorAction SilentlyContinue) {
                                    if (!$global:IsTruncated) {
                                        Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
                                        Write-Entry -Subtext "Added: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                        $posterCount++
                                    }
                                    Else {
                                        Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                    }   
                                    $movietemp = New-Object psobject
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                    $movietemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                    switch -Wildcard ($global:FavProvider) {
                                        'TMDB' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                        'FANART' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                        'TVDB' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                        Default { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                    }

                                    # Export the array to a CSV file
                                    $movietemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                }
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color Red -log Error
                            Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            if ($global:OnlyTextless) {
                                $movietemp = New-Object psobject
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                $movietemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                                $movietemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                $movietemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                                switch -Wildcard ($global:FavProvider) {
                                    'TMDB' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                    'FANART' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                    'TVDB' { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                    Default { $movietemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                }
                            
                                # Export the array to a CSV file
                                $movietemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            }
                            $errorCount++
                        }
                    }
                    else {
                        if ($show_skipped -eq 'True' ) {
                            Write-Entry -Subtext "Already exists: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                        }
                    }
                }
                # Now we can start the Background Poster Part
                if ($global:BackgroundPosters -eq 'true') {
                    if ($LibraryFolders -eq 'true') {
                        $LibraryName = $entry.'Library Name'
                        $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                        $backgroundImageoriginal = "$EntryDir\background.jpg"
                        $TestPath = $EntryDir
                        $Testfile = "background"

                        if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                            New-Item -ItemType Directory -path $EntryDir -Force | out-null
                        }
                    }
                    Else {
                        $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername)_background.jpg"
                        $TestPath = $AssetPath
                        $Testfile = "$($entry.RootFoldername)_background"
                    }

                    if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                        $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                    }
                    else {
                        $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                        if ($fullTestPath) {
                            $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                        }
                        Else {
                            $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                        }
                    }

                    $backgroundImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_background.jpg"
                    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                    if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:posterurl = $null
                        $global:PosterWithText = $null
                        $global:AssetTextLang = $null
                        $global:Fallback = $null
                        $global:IsFallback = $null
                        $global:TMDBAssetTextLang = $null
                        $global:FANARTAssetTextLang = $null
                        $global:TVDBAssetTextLang = $null
                        $global:TMDBAssetChangeUrl = $null
                        $global:FANARTAssetChangeUrl = $null
                        $global:TVDBAssetChangeUrl = $null
                        $global:ImageMagickError = $null
                        if ($PlexToken) {
                            $Arturl = $plexurl + $entry.PlexBackgroundUrl + "?X-Plex-Token=$PlexToken"
                        }
                        Else {
                            $Arturl = $plexurl + $entry.PlexBackgroundUrl
                        }
                        Write-Entry -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                        switch -Wildcard ($global:FavProvider) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                            'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMovieBackground }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartMovieBackground } }
                            'PLEX' { if ($entry.PlexBackgroundUrl) { GetPlexArtwork -Type ' a Movie Background' -ArtUrl $Arturl -TempImage $backgroundImage } }
                            Default { $global:posterurl = GetFanartMovieBackground }
                        }
                        switch -Wildcard ($global:Fallback) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                        }
                        if ($global:PreferTextless -eq 'True') {
                            if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                                $global:posterurl = $global:fanartfallbackposterurl
                                Write-Entry -Subtext "Took Fanart.tv Fallback background because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                $global:IsFallback = $true
                            }
                            if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                                $global:posterurl = $global:TMDBfallbackposterurl
                                Write-Entry -Subtext "Took TMDB Fallback background because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                $global:IsFallback = $true
                            }
                        }
                        if (!$global:posterurl) {
                            if ($global:OnlyTextless) {
                                $global:posterurl = GetFanartMovieBackground
                                if (!$global:FavProvider -eq 'FANART'){
                                    $global:IsFallback = $true
                                }
                            }
                            $global:posterurl = GetTVDBMovieBackground
                            $global:IsFallback = $true
                            if (!$global:posterurl) {
                                if ($entry.PlexBackgroundUrl) {
                                    GetPlexArtwork -Type ' a Movie Background' -ArtUrl $Arturl -TempImage $backgroundImage
                                    $global:IsFallback = $true
                                }
                                Else {
                                    Write-Entry -Subtext "Plex Background Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                }
                                if (!$global:posterurl) {
                                    Write-Entry -Subtext "Could not find a Background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                }
                            }
                        }

                        if ($BackgroundfontAllCaps -eq 'true') {
                            $joinedTitle = $Titletext.ToUpper()
                        }
                        Else {
                            $joinedTitle = $Titletext
                        }
                        if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                            try {
                                if (!$global:PlexartworkDownloaded) {
                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $BackgroundImage -ErrorAction Stop
                                }
                            }
                            catch {
                                $statusCode = $_.Exception.Response.StatusCode.value__
                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                $errorCount++
                            }
                            Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                if ($global:PosterWithText) {
                                    Write-Entry -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                }
                            }
                            elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                if ($global:PosterWithText) {
                                    Write-Entry -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                }
                            }
                            elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                Write-Entry -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TVDBAssetTextLang
                            }
                            elseif ($global:posterurl -like "$PlexUrl*") {
                                Write-Entry -Subtext "Downloading Background from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            }
                            Else {
                                Write-Entry -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            }
                            if ($global:ImageProcessing -eq 'true') {
                                Write-Entry -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                $CommentArguments = "convert `"$backgroundImage`" -set `"comment`" `"created with ppm`" `"$backgroundImage`""
                                $CommentlogEntry = "`"$magick`" $CommentArguments"
                                $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                                if (!$global:ImageMagickError -eq 'True') {
                                    # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                    if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                        $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                        $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                        $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundImage`""
                                        Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                        $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                        Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    }
                                    $logEntry = "`"$magick`" $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                    InvokeMagickCommand -Command $magick -Arguments $Arguments

                                    if ($AddBackgroundText -eq 'true') {
                                        $joinedTitle = $joinedTitle -replace '"', '""'
                                        $joinedTitlePointSize = $joinedTitle -replace '""', '""""'
                                        $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                        if (!$global:IsTruncated) {
                                            Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundImage`""
                                            Write-Entry -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            $logEntry = "`"$magick`" $Arguments"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                            InvokeMagickCommand -Command $magick -Arguments $Arguments
                                        }
                                    }
                                }
                            }
                            Else {
                                $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                $logEntry = "`"$magick`" $Resizeargument"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                            }
                            if (!$global:ImageMagickError -eq 'True') {
                                # Move file back to original naming with Brackets.
                                if (Get-ChildItem -LiteralPath $backgroundImage -ErrorAction SilentlyContinue) {
                                    if (!$global:IsTruncated) {
                                        Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                                        Write-Entry -Subtext "Added: $backgroundImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                        $posterCount++
                                        $BackgroundCount++
                                    }
                                    Else {
                                        Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                    }    
                                    $moviebackgroundtemp = New-Object psobject
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie Background'
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                    $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                    switch -Wildcard ($global:FavProvider) {
                                        'TMDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                        'FANART' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                        'TVDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                        Default { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                    }
                                    # Export the array to a CSV file
                                    $moviebackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                }
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color Red -log Error
                            Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            if ($global:OnlyTextless) {
                                $moviebackgroundtemp = New-Object psobject
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                                switch -Wildcard ($global:FavProvider) {
                                    'TMDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                    'FANART' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                    'TVDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                    Default { $movietemoviebackgroundtempmp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                }
                            
                                # Export the array to a CSV file
                                $moviebackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            }
                            $errorCount++
                        }
                    }
                    else {
                        if ($show_skipped -eq 'True' ) {
                            Write-Entry -Subtext "Already exists: $backgroundImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                        }
                    }
                }
            }

            Else {
                Write-Entry -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                $errorCount++
            }
        }
        catch {
            Write-Entry -Subtext "Could not query entries from movies array, error message: $($_.Exception.Message)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            write-Entry -Subtext "At line $($_.InvocationInfo.ScriptLineNumber)" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            if ($global:OnlyTextless) {
                $moviebackgroundtemp = New-Object psobject
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                switch -Wildcard ($global:FavProvider) {
                    'TMDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                    'FANART' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                    'TVDB' { $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                    Default { $movietemoviebackgroundtempmp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                }
            
                # Export the array to a CSV file
                $moviebackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
            }
            $errorCount++
        }
    }

    Write-Entry -Message "Starting Show/Season Poster/Background/TitleCard Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
    # Show Part
    foreach ($entry in $AllShows) {
        if ($($entry.RootFoldername)) {
            # Define Global Variables
            $global:tmdbid = $entry.tmdbid
            $global:tvdbid = $entry.tvdbid
            $global:imdbid = $entry.imdbid
            $Seasonpostersearchtext = $null
            $global:ImageMagickError = $null
            $Episodepostersearchtext = $null
            $global:TMDBfallbackposterurl = $null
            $global:fanartfallbackposterurl = $null
            $FanartSearched = $null
            $global:plexalreadysearched = $null
            $global:posterurl = $null
            $global:PosterWithText = $null
            $global:AssetTextLang = $null
            $global:TMDBAssetTextLang = $null
            $global:FANARTAssetTextLang = $null
            $global:TVDBAssetTextLang = $null
            $global:TMDBAssetChangeUrl = $null
            $global:FANARTAssetChangeUrl = $null
            $global:TVDBAssetChangeUrl = $null
            $global:IsFallback = $null
            $global:Fallback = $null
            $global:TextlessPoster = $null
            $global:tvdbalreadysearched = $null
            $global:PlexartworkDownloaded = $null

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
                $PosterImageoriginal = "$EntryDir\poster.jpg"
                $TestPath = $EntryDir
                $Testfile = "poster"

                if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                    New-Item -ItemType Directory -path $EntryDir -Force | out-null
                }
            }
            Else {
                $PosterImageoriginal = "$AssetPath\$($entry.RootFoldername).jpg"
                $TestPath = $AssetPath
                $Testfile = $($entry.RootFoldername)
            }

            if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
            }
            else {
                $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                if ($fullTestPath) {
                    $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                }
                Else {
                    $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                }
            }

            Write-Entry -Message "Test Path is: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
            Write-Entry -Message "Test File is: $Testfile" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
            Write-Entry -Message "Resolved Full Test Path is: $fullTestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
            Write-Entry -Message "Resolved hash Test Path is: $hashtestpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug

            $PosterImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername).jpg"
            $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
            if ($PlexToken) {
                $Arturl = $plexurl + $entry.PlexPosterUrl + "?X-Plex-Token=$PlexToken"
            }
            Else {
                $Arturl = $plexurl + $entry.PlexPosterUrl
            }
            # Now we can start the Poster Part
            if ($global:Posters -eq 'true') {
                if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                    Write-Entry -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartShowPoster } }
                        'FANART' { $global:posterurl = GetFanartShowPoster }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowPoster }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartShowPoster } }
                        'PLEX' { if ($entry.PlexPosterUrl) { GetPlexArtwork -Type ' a Show Poster' -ArtUrl $Arturl -TempImage $PosterImage } }
                        Default { $global:posterurl = GetFanartShowPoster }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster } }
                        'FANART' { $global:posterurl = GetFanartShowPoster }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-Entry -Subtext "Took Fanart.tv Fallback poster because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-Entry -Subtext "Took TMDB Fallback poster because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                            $global:IsFallback = $true
                        }
                        # try to find textless on TVDB
                        if ($global:TextlessPoster -ne 'true' -and $entry.tvdbid ) {
                            $global:posterurl = GetTVDBShowPoster
                            $global:IsFallback = $true
                            $global:tvdbalreadysearched = $true
                        }
                    }

                    if (!$global:TextlessPoster -eq 'true' -and $global:posterurl) {
                        $global:PosterWithText = $true
                    }

                    if (!$global:posterurl -and $global:tvdbalreadysearched -ne "True") {
                        $global:posterurl = GetTVDBShowPoster
                        $global:IsFallback = $true
                        if (!$global:posterurl -and !$global:TMDBfallbackposterurl -and !$global:fanartfallbackposterurl) {
                            if ($entry.PlexPosterUrl -and !$global:OnlyTextless) {
                                GetPlexArtwork -Type ' a Show Poster' -ArtUrl $Arturl -TempImage $PosterImage
                                $global:plexalreadysearched = $True
                            }
                            Else {
                                Write-Entry -Subtext "Plex Poster Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            }
                            if (!$global:posterurl) {
                                Write-Entry -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            }
                        }
                    }
                    if (!$global:posterurl -and !$global:plexalreadysearched -eq 'True') {
                        $global:IsFallback = $true
                        if ($entry.PlexPosterUrl -and !$global:OnlyTextless) {
                            GetPlexArtwork -Type ' a Show Poster' -ArtUrl $Arturl -TempImage $PosterImage
                            $global:plexalreadysearched = $True
                        }
                        Else {
                            Write-Entry -Subtext "Plex Poster Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                        }
                        if (!$global:posterurl) {
                            Write-Entry -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                        }
                    }
                    if ($fontAllCaps -eq 'true') {
                        $joinedTitle = $Titletext.ToUpper()
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    if (!$global:TextlessPoster -eq 'True' -and $global:TMDBfallbackposterurl) {
                        $global:posterurl = $global:TMDBfallbackposterurl
                    }
                    if (!$global:TextlessPoster -eq 'True' -and $global:fanartfallbackposterurl) {
                        $global:posterurl = $global:fanartfallbackposterurl
                    }
                    if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                        try {
                            if (!$global:PlexartworkDownloaded) {
                                $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage -ErrorAction Stop
                            }
                        }
                        catch {
                            $statusCode = $_.Exception.Response.StatusCode.value__
                            Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            $errorCount++
                        }
                        Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                            if ($global:PosterWithText) {
                                Write-Entry -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TMDBAssetTextLang
                            }
                            Else {
                                Write-Entry -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TMDBAssetTextLang
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Entry -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:FANARTAssetTextLang
                            }
                            Else {
                                Write-Entry -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:FANARTAssetTextLang
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Entry -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            $global:AssetTextLang = $global:TVDBAssetTextLang
                        }
                        elseif ($global:posterurl -like "$PlexUrl*") {
                            Write-Entry -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            $global:IsFallback = $true
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-Entry -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            $CommentArguments = "convert `"$PosterImage`" -set `"comment`" `"created with ppm`" `"$PosterImage`""
                            $CommentlogEntry = "`"$magick`" $CommentArguments"
                            $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                            InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                            if (!$global:ImageMagickError -eq 'True') {
                                # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                    $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                    $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                    $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                    $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                                    Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                $logEntry = "`"$magick`" $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $Arguments

                                if ($AddText -eq 'true') {
                                    $joinedTitle = $joinedTitle -replace '"', '""'
                                    $joinedTitlePointSize = $joinedTitle -replace '""', '""""'
                                    $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                    if (!$global:IsTruncated) {
                                        Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
                                        Write-Entry -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $logEntry = "`"$magick`" $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                        InvokeMagickCommand -Command $magick -Arguments $Arguments
                                    }
                                }
                            }
                        }
                        Else {
                            $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                            Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            $logEntry = "`"$magick`" $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                            InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                        }
                        if (!$global:ImageMagickError -eq 'True') {
                            if (Get-ChildItem -LiteralPath $PosterImage -ErrorAction SilentlyContinue) {
                                # Move file back to original naming with Brackets.
                                if (!$global:IsTruncated) {
                                    Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
                                    Write-Entry -Subtext "Added: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                    Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                    $posterCount++
                                }
                                Else {
                                    Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                }   
                                $showtemp = New-Object psobject
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show'
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                $showtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                $showtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                $showtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                switch -Wildcard ($global:FavProvider) {
                                    'TMDB' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                    'FANART' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                    'TVDB' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                    Default { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                }
                                # Export the array to a CSV file
                                $showtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            }
                        }
                    }
                    Else {
                        Write-Entry -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color Red -log Error
                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                        if ($global:OnlyTextless) {
                            $showtemp = New-Object psobject
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                            $showtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                            $showtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                            $showtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                            switch -Wildcard ($global:FavProvider) {
                                'TMDB' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                'FANART' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                'TVDB' { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                Default { $showtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                            }
                        
                            # Export the array to a CSV file
                            $showtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        }
                        $errorCount++
                    }
                }
                else {
                    if ($show_skipped -eq 'True' ) {
                        Write-Entry -Subtext "Already exists: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                    }
                }
            }
            # Now we can start the Background Part
            if ($global:BackgroundPosters -eq 'true') {
                if ($LibraryFolders -eq 'true') {
                    $LibraryName = $entry.'Library Name'
                    $EntryDir = "$AssetPath\$LibraryName\$($entry.RootFoldername)"
                    $backgroundImageoriginal = "$EntryDir\background.jpg"
                    $TestPath = $EntryDir
                    $Testfile = "background"

                    if (!(Get-ChildItem -LiteralPath $EntryDir -ErrorAction SilentlyContinue)) {
                        New-Item -ItemType Directory -path $EntryDir -Force | out-null
                    }
                }
                Else {
                    $backgroundImageoriginal = "$AssetPath\$($entry.RootFoldername)_background.jpg"
                    $TestPath = $AssetPath
                    $Testfile = "$($entry.RootFoldername)_background"
                }

                if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                    $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                }
                else {
                    $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                    if ($fullTestPath) {
                        $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                    }
                    Else {
                        $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                    }
                }

                Write-Entry -Message "Test Path is: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Test File is: $Testfile" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Resolved Full Test Path is: $fullTestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                Write-Entry -Message "Resolved hash Test Path is: $hashtestpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug

                $backgroundImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_background.jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:posterurl = $null
                    $global:PosterWithText = $null
                    $global:AssetTextLang = $null
                    $global:Fallback = $null
                    $global:IsFallback = $null
                    $global:TMDBAssetTextLang = $null
                    $global:FANARTAssetTextLang = $null
                    $global:TVDBAssetTextLang = $null
                    $global:TMDBAssetChangeUrl = $null
                    $global:FANARTAssetChangeUrl = $null
                    $global:TVDBAssetChangeUrl = $null
                    $global:TextlessPoster = $null
                    $global:ImageMagickError = $null

                    if ($PlexToken) {
                        $Arturl = $plexurl + $entry.PlexBackgroundUrl + "?X-Plex-Token=$PlexToken"
                    }
                    Else {
                        $Arturl = $plexurl + $entry.PlexBackgroundUrl
                    }

                    Write-Entry -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowBackground }Else { Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning; $global:posterurl = GetFanartShowBackground } }
                        'PLEX' { if ($entry.PlexBackgroundUrl) { GetPlexArtwork -Type ' a Show Background' -ArtUrl $Arturl -TempImage $backgroundImage } }
                        Default { $global:posterurl = GetFanartShowBackground }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-Entry -Subtext "Took Fanart.tv Fallback background because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-Entry -Subtext "Took TMDB Fallback background because it is your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                            $global:IsFallback = $true
                        }
                    }
                    if ($global:TextlessPoster -eq 'true' -and $global:posterurl) {
                    }
                    if (!$global:posterurl) {
                        if ($global:OnlyTextless) {
                            $global:posterurl = GetFanartShowBackground
                        }
                        $global:posterurl = GetTVDBShowBackground
                        $global:IsFallback = $true

                        if (!$global:posterurl) {
                            if ($entry.PlexBackgroundUrl) {
                                GetPlexArtwork -Type ' a Show Background' -ArtUrl $Arturl -TempImage $backgroundImage
                            }
                            Else {
                                Write-Entry -Subtext "Plex Background Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            }
                            if (!$global:posterurl) {
                                Write-Entry -Subtext "Could not find a background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            }
                        }

                    }

                    if ($BackgroundfontAllCaps -eq 'true') {
                        $joinedTitle = $Titletext.ToUpper()
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                        try {
                            if (!$global:PlexartworkDownloaded) {
                                $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $BackgroundImage -ErrorAction Stop
                            }
                        }
                        catch {
                            $statusCode = $_.Exception.Response.StatusCode.value__
                            Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            $errorCount++
                        }
                        Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                            if ($global:PosterWithText) {
                                Write-Entry -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TMDBAssetTextLang
                            }
                            Else {
                                Write-Entry -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:TMDBAssetTextLang
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Entry -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:FANARTAssetTextLang
                            }
                            Else {
                                Write-Entry -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                $global:AssetTextLang = $global:FANARTAssetTextLang
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Entry -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            $global:AssetTextLang = $global:TVDBAssetTextLang
                        }
                        elseif ($global:posterurl -like "$PlexUrl*") {
                            Write-Entry -Subtext "Downloading Background from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                        }
                        Else {
                            Write-Entry -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-Entry -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            $CommentArguments = "convert `"$backgroundImage`" -set `"comment`" `"created with ppm`" `"$backgroundImage`""
                            $CommentlogEntry = "`"$magick`" $CommentArguments"
                            $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                            InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                            if (!$global:ImageMagickError -eq 'True') {
                                # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundImage`""
                                    Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                    Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                }
                                $logEntry = "`"$magick`" $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                InvokeMagickCommand -Command $magick -Arguments $Arguments

                                if ($AddBackgroundText -eq 'true') {
                                    $joinedTitle = $joinedTitle -replace '"', '""'
                                    $joinedTitlePointSize = $joinedTitle -replace '""', '""""'
                                    $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                    if (!$global:IsTruncated) {
                                        Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundImage`""
                                        Write-Entry -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $logEntry = "`"$magick`" $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                        InvokeMagickCommand -Command $magick -Arguments $Arguments
                                    }
                                }
                            }
                        }
                        Else {
                            $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                            Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            $logEntry = "`"$magick`" $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                            InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                        }
                        if (!$global:ImageMagickError -eq 'True') {
                            # Move file back to original naming with Brackets.
                            if (Get-ChildItem -LiteralPath $backgroundImage -ErrorAction SilentlyContinue) {
                                if (!$global:IsTruncated) {
                                    Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                                    $BackgroundCount++
                                    Write-Entry -Subtext "Added: $backgroundImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                    Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                    $posterCount++
                                }
                                Else {
                                    Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                }    
                                $showbackgroundtemp = New-Object psobject
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show Background'
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                switch -Wildcard ($global:FavProvider) {
                                    'TMDB' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                    'FANART' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                    'TVDB' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                    Default { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                }
                                # Export the array to a CSV file
                                $showbackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append

                            }
                        }
                    }
                    Else {
                        Write-Entry -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color Red -log Error
                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                        if ($global:OnlyTextless) {
                            $showbackgroundtemp = New-Object psobject
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                            $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                            switch -Wildcard ($global:FavProvider) {
                                'TMDB' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                'FANART' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                'TVDB' { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                Default { $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                            }
                        
                            # Export the array to a CSV file
                            $showbackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        }
                        $errorCount++
                    }
                }
                else {
                    if ($show_skipped -eq 'True' ) {
                        Write-Entry -Subtext "Already exists: $backgroundImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                    }
                }
            }
            # Now we can start the Season Part
            if ($global:SeasonPosters -eq 'true') {
                $global:IsFallback = $null
                $global:AssetTextLang = $null
                $global:Fallback = $null
                $global:TMDBAssetTextLang = $null
                $global:FANARTAssetTextLang = $null
                $global:TVDBAssetTextLang = $null
                $global:TMDBAssetChangeUrl = $null
                $global:FANARTAssetChangeUrl = $null
                $global:TVDBAssetChangeUrl = $null
                $global:PosterWithText = $null
                $global:ImageMagickError = $null
                $global:TextlessPoster = $null
                $global:seasonNames = $entry.SeasonNames -split ','
                $global:seasonNumbers = $entry.seasonNumbers -split ','
                $global:PlexSeasonUrls = $entry.PlexSeasonUrls -split ','
                for ($i = 0; $i -lt $global:seasonNames.Count; $i++) {
                    $global:posterurl = $null
                    $global:IsFallback = $null
                    $global:AssetTextLang = $null
                    $global:Fallback = $null
                    $global:TMDBAssetTextLang = $null
                    $global:FANARTAssetTextLang = $null
                    $global:TVDBAssetTextLang = $null
                    $global:TMDBAssetChangeUrl = $null
                    $global:FANARTAssetChangeUrl = $null
                    $global:TVDBAssetChangeUrl = $null
                    $global:PosterWithText = $null
                    $global:ImageMagickError = $null
                    $global:TMDBSeasonFallback = $null
                    if ($SeasonfontAllCaps -eq 'true') {
                        $global:seasonTitle = $global:seasonNames[$i].ToUpper()
                    }
                    Else {
                        $global:seasonTitle = $global:seasonNames[$i]
                    }
                    $global:SeasonNumber = $global:seasonNumbers[$i]
                    $global:PlexSeasonUrl = $global:PlexSeasonUrls[$i]
                    $global:season = "Season" + $global:SeasonNumber.PadLeft(2, '0')

                    if ($LibraryFolders -eq 'true') {
                        $SeasonImageoriginal = "$EntryDir\$global:season.jpg"
                        $TestPath = $EntryDir
                        $Testfile = "$global:season"
                    }
                    Else {
                        $SeasonImageoriginal = "$AssetPath\$($entry.RootFoldername)_$global:season.jpg"
                        $TestPath = $AssetPath
                        $Testfile = "$($entry.RootFoldername)_$global:season"
                    }

                    if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                        $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                    }
                    else {
                        $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                        if ($fullTestPath) {
                            $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                        }
                        Else {
                            $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                        }
                    }

                    Write-Entry -Message "Test Path is: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    Write-Entry -Message "Test File is: $Testfile" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    Write-Entry -Message "Resolved Full Test Path is: $fullTestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                    Write-Entry -Message "Resolved hash Test Path is: $hashtestpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug

                    $SeasonImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_$global:season.jpg"
                    $SeasonImage = $SeasonImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                    if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                        if ($PlexToken) {
                            $Arturl = $plexurl + $global:PlexSeasonUrl + "?X-Plex-Token=$PlexToken"
                        }
                        Else {
                            $Arturl = $plexurl + $global:PlexSeasonUrl
                        }
                        if (!$Seasonpostersearchtext) {
                            Write-Entry -Message "Start Season Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            $Seasonpostersearchtext = $true
                        }
                        # do a specific order
                        if ($entry.tmdbid) {
                            $global:posterurl = GetTMDBSeasonPoster
                            if (!$global:posterurl) {
                                $global:posterurl = GetFanartSeasonPoster
                                $global:IsFallback = $true
                            }
                            if ($global:posterurl -and $global:PreferTextless -eq 'True' -and !$global:TextlessPoster) {
                                $global:posterurl = GetFanartSeasonPoster
                                $global:IsFallback = $true
                            }
                            if ((!$global:posterurl -or !$global:TextlessPoster) -and $entry.tvdbid) {
                                $global:IsFallback = $true
                                $global:posterurl = GetTVDBSeasonPoster
                            }
                            if (!$global:posterurl) {
                                $global:IsFallback = $true
                                if ($entry.PlexSeasonUrl -and !$global:OnlyTextless) {
                                    GetPlexArtwork -Type ' a Season Poster' -ArtUrl $Arturl -TempImage $SeasonImage
                                }
                                Else {
                                    Write-Entry -Subtext "Plex Season Poster Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                }
                                if (!$global:posterurl) {
                                    Write-Entry -Subtext "Could not find a season poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                }
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                            $global:posterurl = GetFanartSeasonPoster
                            if (!$global:posterurl) {
                                $global:IsFallback = $true
                                if ($entry.tvdbid) {
                                    $global:posterurl = GetTVDBSeasonPoster
                                }
                                if (!$global:posterurl) {
                                    $global:IsFallback = $true
                                    if ($entry.PlexSeasonUrl -and !$global:OnlyTextless) {
                                        GetPlexArtwork -Type ' a Season Poster' -ArtUrl $Arturl -TempImage $SeasonImage
                                    }
                                    Else {
                                        Write-Entry -Subtext "Plex Season Poster Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                    }
                                    if (!$global:posterurl) {
                                        Write-Entry -Subtext "Could not find a season poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                    }
                                }
                            }
                        }
                        if ($global:TMDBSeasonFallback -and $global:PosterWithText) {
                            $global:posterurl = $global:TMDBSeasonFallback
                            Write-Entry -Subtext "Taking Season Poster with text as fallback from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                            $global:IsFallback = $true
                        }
                        if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                            if ($global:ImageProcessing -eq 'true') {
                                try {
                                    if (!$global:PlexartworkDownloaded) {
                                        $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage -ErrorAction Stop
                                    }
                                }
                                catch {
                                    $statusCode = $_.Exception.Response.StatusCode.value__
                                    Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                    Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                    $errorCount++
                                }
                                Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Entry -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                    if ($global:FavProvider -ne 'TMDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Entry -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                    if ($global:FavProvider -ne 'FANART') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Entry -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TVDBAssetTextLang
                                    if ($global:FavProvider -ne 'TVDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like "$PlexUrl*") {
                                    Write-Entry -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    if ($global:FavProvider -ne 'PLEX') {
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                    $CommentArguments = "convert `"$SeasonImage`" -set `"comment`" `"created with ppm`" `"$SeasonImage`""
                                    $CommentlogEntry = "`"$magick`" $CommentArguments"
                                    $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                    InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                                    if (!$global:ImageMagickError -eq 'True') {
                                        # Resize Image to 2000x3000 and apply Border and overlay
                                        if ($AddSeasonBorder -eq 'true' -and $AddSeasonOverlay -eq 'true') {
                                            $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$SeasonImage`""
                                            Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        }
                                        if ($AddSeasonBorder -eq 'true' -and $AddSeasonOverlay -eq 'false') {
                                            $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$Seasonborderwidthsecond`"  -bordercolor `"$Seasonbordercolor`" -border `"$Seasonborderwidth`" `"$SeasonImage`""
                                            Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        }
                                        if ($AddSeasonBorder -eq 'false' -and $AddSeasonOverlay -eq 'true') {
                                            $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$SeasonImage`""
                                            Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        }
                                        if ($AddSeasonBorder -eq 'false' -and $AddSeasonOverlay -eq 'false') {
                                            $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                            Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        }

                                        $logEntry = "`"$magick`" $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                        InvokeMagickCommand -Command $magick -Arguments $Arguments

                                        if ($AddSeasonText -eq 'true') {
                                            $global:seasonTitle = $global:seasonTitle -replace '"', '""'
                                            $joinedTitlePointSize = $global:seasonTitle -replace '""', '""""'
                                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $fontImagemagick -box_width $SeasonMaxWidth  -box_height $SeasonMaxHeight -min_pointsize $SeasonminPointSize -max_pointsize $SeasonmaxPointSize
                                            if (!$global:IsTruncated) {
                                                Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

                                                $Arguments = "`"$SeasonImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Seasonfontcolor`" -size `"$Seasonboxsize`" -background none caption:`"$global:seasonTitle`" -trim -gravity south -extent `"$Seasonboxsize`" `) -gravity south -geometry +0`"$Seasontext_offset`" -quality $global:outputQuality -composite `"$SeasonImage`""

                                                Write-Entry -Subtext "Applying seasonTitle text: `"$global:seasonTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                $logEntry = "`"$magick`" $Arguments"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                InvokeMagickCommand -Command $magick -Arguments $Arguments
                                            }
                                        }
                                    }
                                }
                            }
                            Else {
                                try {
                                    if (!$global:PlexartworkDownloaded) {
                                        $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage -ErrorAction Stop
                                    }
                                }
                                catch {
                                    $statusCode = $_.Exception.Response.StatusCode.value__
                                    Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                    Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                    $errorCount++
                                }
                                Write-Entry -Subtext "Poster url: $(RedactPlexUrl -url $global:posterurl)" -Path "$($global:ScriptRoot)\Logs\Scriptlog.log" -Color White -log Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Entry -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                    if ($global:FavProvider -ne 'TMDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Entry -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:FANARTAssetTextLang
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'FANART') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Entry -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $global:AssetTextLang = $global:TVDBAssetTextLang
                                    if ($global:FavProvider -ne 'TVDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like "$PlexUrl*") {
                                    Write-Entry -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    if ($global:FavProvider -ne 'PLEX') {
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Entry -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') {
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                    # Resize Image to 2000x3000
                                    $Resizeargument = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                    Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                    $logEntry = "`"$magick`" $Resizeargument"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                    InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                                }
                            }
                            if (!$global:ImageMagickError -eq 'True') {
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                    # Move file back to original naming with Brackets.
                                    if (!$global:IsTruncated) {
                                        Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                                        Write-Entry -Subtext "Added: $SeasonImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                        $SeasonCount++
                                        $posterCount++
                                    }
                                    Else {
                                        Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                    }    
                                    $seasontemp = New-Object psobject
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Titletext + " | " + $global:season)
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Season'
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                    $seasontemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                    switch -Wildcard ($global:FavProvider) {
                                        'TMDB' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                        'FANART' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                        'TVDB' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                        Default { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                    }
                                    # Export the array to a CSV file
                                    $seasontemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                }
                            }
                        }
                        Else {
                            Write-Entry -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color Red -log Error
                            Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                            if ($global:OnlyTextless) {
                                $seasontemp = New-Object psobject
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                $seasontemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                                switch -Wildcard ($global:FavProvider) {
                                    'TMDB' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                    'FANART' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                    'TVDB' { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                    Default { $seasontemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                }
                            
                                # Export the array to a CSV file
                                $seasontemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            }
                            $errorCount++
                        }
                    }
                    else {
                        if ($show_skipped -eq 'True' ) {
                            Write-Entry -Subtext "Already exists: $SeasonImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                        }
                    }
                }
            }
            # Now we can start the Episode Part
            if ($global:TitleCards -eq 'true') {
                # Loop through each episode
                foreach ($episode in $Episodedata) {
                    $global:AssetTextLang = $null
                    $global:TMDBAssetTextLang = $null
                    $global:FANARTAssetTextLang = $null
                    $global:TVDBAssetTextLang = $null
                    $global:TMDBAssetChangeUrl = $null
                    $global:FANARTAssetChangeUrl = $null
                    $global:TVDBAssetChangeUrl = $null
                    $global:PosterWithText = $null
                    $global:TempImagecopied = $false
                    $EpisodeTempImage = $null
                    $global:ImageMagickError = $null
                    $global:season_number = $null
                    $Episodepostersearchtext = $null
                    $global:show_name = $null
                    $global:episodenumber = $null
                    $global:episode_numbers = $null
                    $global:titles = $null
                    $global:posterurl = $null
                    $global:FileNaming = $null
                    $EpisodeImageoriginal = $null
                    $EpisodeImage = $null
                    $global:Fallback = $null
                    $global:IsFallback = $null
                    $global:TextlessPoster = $null

                    if (($episode.tmdbid -eq $entry.tmdbid -or $episode.tvdbid -eq $entry.tvdbid) -and $episode.'Show Name' -eq $entry.title -and $episode.'Library Name' -eq $entry.'Library Name') {
                        $global:show_name = $episode."Show Name"
                        $global:season_number = $episode."Season Number"
                        $global:episode_numbers = $episode."Episodes".Split(",")
                        $global:titles = $episode."Title".Split(";")
                        $global:PlexTitleCardUrls = $episode."PlexTitleCardUrls".Split(",")
                        if ($UseBackgroundAsTitleCard -eq 'True') {
                            $global:ImageMagickError = $null
                            for ($i = 0; $i -lt $global:episode_numbers.Count; $i++) {
                                $global:AssetTextLang = $null
                                $global:TMDBAssetTextLang = $null
                                $global:FANARTAssetTextLang = $null
                                $global:TVDBAssetTextLang = $null
                                $global:TMDBAssetChangeUrl = $null
                                $global:FANARTAssetChangeUrl = $null
                                $global:TVDBAssetChangeUrl = $null
                                $global:PosterWithText = $null
                                $global:Fallback = $null
                                $global:IsFallback = $null
                                $global:posterurl = $null
                                $Episodepostersearchtext = $null
                                $ExifFound = $null
                                $global:PlexartworkDownloaded = $null
                                $value = $null
                                $magickcommand = $null
                                $Arturl = $null
                                $global:PlexTitleCardUrl = $entry.PlexBackgroundUrl
                                $global:EPTitle = $($global:titles[$i].Trim())
                                $global:episodenumber = $($global:episode_numbers[$i].Trim())
                                $global:FileNaming = "S" + $global:season_number.PadLeft(2, '0') + "E" + $global:episodenumber.PadLeft(2, '0')
                                $bullet = [char]0x2022
                                $global:SeasonEPNumber = "$SeasonTCText $global:season_number $bullet $EpisodeTCText $global:episodenumber"

                                if ($LibraryFolders -eq 'true') {
                                    $EpisodeImageoriginal = "$EntryDir\$global:FileNaming.jpg"
                                    $TestPath = $EntryDir
                                    $Testfile = "$global:FileNaming"
                                }
                                Else {
                                    $EpisodeImageoriginal = "$AssetPath\$($entry.RootFoldername)_$global:FileNaming.jpg"
                                    $TestPath = $AssetPath
                                    $Testfile = "$($entry.RootFoldername)_$global:FileNaming"
                                }

                                if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                                    $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                                }
                                else {
                                    $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                                    if ($fullTestPath) {
                                        $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                                    }
                                    Else {
                                        $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                                    }
                                }

                                Write-Entry -Message "Test Path is: $TestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                                Write-Entry -Message "Test File is: $Testfile" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                                Write-Entry -Message "Resolved Full Test Path is: $fullTestPath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug
                                Write-Entry -Message "Resolved hash Test Path is: $hashtestpath" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Debug

                                $EpisodeImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_$global:FileNaming.jpg"
                                $EpisodeImage = $EpisodeImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                                $EpisodeTempImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\temp.jpg"
                                if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                                    if (!$Episodepostersearchtext) {
                                        Write-Entry -Message "Start Title Card Search for: $global:show_name - $global:SeasonEPNumber" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $Episodepostersearchtext = $true
                                    }
                                    if ($PlexToken) {
                                        $Arturl = $plexurl + $global:PlexTitleCardUrl + "?X-Plex-Token=$PlexToken"
                                    }
                                    Else {
                                        $Arturl = $plexurl + $global:PlexTitleCardUrl
                                    }
                                    # now search for TitleCards
                                    if ($global:FavProvider -eq 'TMDB') {
                                        if ($episode.tmdbid) {
                                            $global:posterurl = GetTMDBShowBackground
                                            if ($global:Fallback -eq "TVDB") {
                                                $global:posterurl = GetTVDBShowBackground
                                            }
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if ($global:tmdbfallbackposterurl) {
                                                    $global:posterurl = $global:tmdbfallbackposterurl
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                        }
                                        else {
                                            Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                            $global:posterurl = GetTVDBShowBackground
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                        }
                                    }
                                    Else {
                                        if ($episode.tvdbid) {
                                            $global:posterurl = GetTVDBShowBackground
                                            if ($global:Fallback -eq "TMDB") {
                                                $global:posterurl = GetTMDBShowBackground
                                            }
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                        }
                                        else {
                                            Write-Entry -Subtext "Can't search on TVDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                            $global:posterurl = GetTMDBShowBackground
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                        }
                                    }
                                    if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                                        if ($global:ImageProcessing -eq 'true') {
                                            try {
                                                if (!$global:PlexartworkDownloaded -and $global:TempImagecopied -ne 'True') {
                                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage -ErrorAction Stop
                                                    Copy-Item -LiteralPath $EpisodeImage -destination $EpisodeTempImage | Out-Null
                                                }
                                            }
                                            catch {
                                                $statusCode = $_.Exception.Response.StatusCode.value__
                                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                $errorCount++
                                            }
                                            if ($global:TempImagecopied -ne 'True') {
                                                Write-Entry -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                                    Write-Entry -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                    $global:AssetTextLang = $global:TMDBAssetTextLang
                                                    if ($global:FavProvider -ne 'TMDB') {
                                                        $global:IsFallback = $true
                                                    }
                                                }
                                                if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                                    Write-Entry -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                    $global:AssetTextLang = $global:TVDBAssetTextLang
                                                    if ($global:FavProvider -ne 'TVDB') {
                                                        $global:IsFallback = $true
                                                    }
                                                }
                                                if ($global:posterurl -like "$PlexUrl*") {
                                                    Write-Entry -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                    if ($global:FavProvider -ne 'PLEX') {
                                                        $global:IsFallback = $true
                                                    }
                                                }
                                            }
                                            Else {
                                                Copy-Item -LiteralPath $EpisodeTempImage -destination $EpisodeImage | Out-Null
                                            }
                                            $global:TempImagecopied = $true
                                            # Check temp image
                                            if ((Get-ChildItem -LiteralPath $EpisodeTempImage -ErrorAction SilentlyContinue).length -eq '0') {
                                                Write-Entry -Subtext "Temp image is corrupt, cannot proceed" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                $errorCount++
                                            }
                                            Else {
                                                if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                    $CommentArguments = "convert `"$EpisodeImage`" -set `"comment`" `"created with ppm`" `"$EpisodeImage`""
                                                    $CommentlogEntry = "`"$magick`" $CommentArguments"
                                                    $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                    InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                                                    if (!$global:ImageMagickError -eq 'True') {
                                                        # Resize Image to 2000x3000 and apply Border and overlay
                                                        if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'true') {
                                                            $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                            Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                        }
                                                        if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'false') {
                                                            $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                            Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                        }
                                                        if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'true') {
                                                            $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite `"$EpisodeImage`""
                                                            Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                        }
                                                        if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'false') {
                                                            $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                            Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                        }
                                                        $logEntry = "`"$magick`" $Arguments"
                                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                        InvokeMagickCommand -Command $magick -Arguments $Arguments

                                                        if ($AddTitleCardEPTitleText -eq 'true') {
                                                            if ($TitleCardEPTitlefontAllCaps -eq 'true') {
                                                                $global:EPTitle = $global:EPTitle.ToUpper()
                                                            }
                                                            $global:EPTitle = $global:EPTitle -replace '"', '""'
                                                            $joinedTitlePointSize = $global:EPTitle -replace '""', '""""'
                                                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $TitleCardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
                                                            if (!$global:IsTruncated) {
                                                                Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

                                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPTitlefontcolor`" -size `"$TitleCardEPTitleboxsize`" -background none caption:`"$global:EPTitle`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" `) -gravity south -geometry +0`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""

                                                                Write-Entry -Subtext "Applying EPTitle text: `"$global:EPTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                                $logEntry = "`"$magick`" $Arguments"
                                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                                InvokeMagickCommand -Command $magick -Arguments $Arguments
                                                            }
                                                        }
                                                        if ($AddTitleCardEPText -eq 'true') {
                                                            if ($TitleCardEPfontAllCaps -eq 'true') {
                                                                $global:SeasonEPNumber = $global:SeasonEPNumber.ToUpper()
                                                            }
                                                            $global:SeasonEPNumber = $global:SeasonEPNumber -replace '"', '""'
                                                            $joinedTitlePointSize = $global:SeasonEPNumber -replace '""', '""""'
                                                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $TitleCardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
                                                            if (!$global:IsTruncated) {
                                                                Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

                                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPfontcolor`" -size `"$TitleCardEPboxsize`" -background none caption:`"$global:SeasonEPNumber`" -trim -gravity south -extent `"$TitleCardEPboxsize`" `) -gravity south -geometry +0`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""

                                                                Write-Entry -Subtext "Applying SeasonEPNumber text: `"$global:SeasonEPNumber`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                                $logEntry = "`"$magick`" $Arguments"
                                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                                InvokeMagickCommand -Command $magick -Arguments $Arguments
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Else {
                                            try {
                                                if (!$global:PlexartworkDownloaded) {
                                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage -ErrorAction Stop
                                                }
                                            }
                                            catch {
                                                $statusCode = $_.Exception.Response.StatusCode.value__
                                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                $errorCount++
                                            }
                                            Write-Entry -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TMDBAssetTextLang
                                                if ($global:FavProvider -ne 'TMDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TVDBAssetTextLang
                                                if ($global:FavProvider -ne 'TVDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like "$PlexUrl*") {
                                                Write-Entry -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                if ($global:FavProvider -ne 'PLEX') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                # Resize Image to 2000x3000
                                                $Resizeargument = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                $logEntry = "`"$magick`" $Resizeargument"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                                            }
                                        }
                                        if (!$global:ImageMagickError -eq 'True') {
                                            if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                # Move file back to original naming with Brackets.
                                                if (!$global:IsTruncated) {
                                                    Move-Item -LiteralPath $EpisodeImage -destination $EpisodeImageoriginal -Force -ErrorAction SilentlyContinue
                                                    Write-Entry -Subtext "Added: $EpisodeImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                                    Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                                    $EpisodeCount++
                                                    $posterCount++
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }    
                                                $episodetemp = New-Object psobject
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($global:FileNaming + " | " + $global:EPTitle)
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Episode'
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                                switch -Wildcard ($global:FavProvider) {
                                                    'TMDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                                    'FANART' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                                    'TVDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                                    Default { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                                }
                                                # Export the array to a CSV file
                                                $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                            }
                                        }
                                    }
                                    Else {
                                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                        if ($global:OnlyTextless) {
                                            $episodetemp = New-Object psobject
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                                            switch -Wildcard ($global:FavProvider) {
                                                'TMDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                                'FANART' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                                'TVDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                                Default { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                            }
                                        
                                            # Export the array to a CSV file
                                            $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                        }
                                        $errorCount++
                                    }

                                }
                                else {
                                    if ($show_skipped -eq 'True' ) {
                                        Write-Entry -Subtext "Already exists: $EpisodeImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                    }
                                }
                            }
                            if (Test-Path $EpisodeTempImage -ErrorAction SilentlyContinue) {
                                Remove-Item -LiteralPath $EpisodeTempImage | Out-Null
                                Write-Entry -Message "Deleting EpisodeTempImage: $EpisodeTempImage" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                            }
                        }
                        Else {
                            for ($i = 0; $i -lt $global:episode_numbers.Count; $i++) {
                                $global:AssetTextLang = $null
                                $global:TMDBAssetTextLang = $null
                                $global:FANARTAssetTextLang = $null
                                $global:TVDBAssetTextLang = $null
                                $global:TMDBAssetChangeUrl = $null
                                $global:FANARTAssetChangeUrl = $null
                                $global:TVDBAssetChangeUrl = $null
                                $global:PosterWithText = $null
                                $global:Fallback = $null
                                $global:IsFallback = $null
                                $global:ImageMagickError = $null
                                $global:TextlessPoster = $null
                                $global:posterurl = $null
                                $Episodepostersearchtext = $null
                                $ExifFound = $null
                                $global:PlexartworkDownloaded = $null
                                $value = $null
                                $magickcommand = $null
                                $Arturl = $null
                                $global:PlexTitleCardUrl = $($global:PlexTitleCardUrls[$i].Trim())
                                $global:EPTitle = $($global:titles[$i].Trim())
                                $global:episodenumber = $($global:episode_numbers[$i].Trim())
                                $global:FileNaming = "S" + $global:season_number.PadLeft(2, '0') + "E" + $global:episodenumber.PadLeft(2, '0')
                                $bullet = [char]0x2022
                                $global:SeasonEPNumber = "$SeasonTCText $global:season_number $bullet $EpisodeTCText $global:episodenumber"

                                if ($LibraryFolders -eq 'true') {
                                    $EpisodeImageoriginal = "$EntryDir\$global:FileNaming.jpg"
                                    $TestPath = $EntryDir
                                    $Testfile = "$global:FileNaming"
                                }
                                Else {
                                    $EpisodeImageoriginal = "$AssetPath\$($entry.RootFoldername)_$global:FileNaming.jpg"
                                    $TestPath = $AssetPath
                                    $Testfile = "$($entry.RootFoldername)_$global:FileNaming"
                                }

                                if ($Platform -eq 'Docker' -or $Platform -eq 'Linux') {
                                    $hashtestpath = ($TestPath + "/" + $Testfile).Replace('\', '/').Replace('./', '/')
                                }
                                else {
                                    $fullTestPath = Resolve-Path -Path $TestPath -ErrorAction SilentlyContinue
                                    if ($fullTestPath) {
                                        $hashtestpath = ($fullTestPath.Path + "\" + $Testfile).Replace('/', '\')
                                    }
                                    Else {
                                        $hashtestpath = ($TestPath + "\" + $Testfile).Replace('/', '\')
                                    }
                                }

                                $EpisodeImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_$global:FileNaming.jpg"
                                $EpisodeImage = $EpisodeImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                                if (-not $directoryHashtable.ContainsKey("$hashtestpath")) {
                                    if (!$Episodepostersearchtext) {
                                        Write-Entry -Message "Start Title Card Search for: $global:show_name - $global:SeasonEPNumber" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                        $Episodepostersearchtext = $true
                                    }
                                    if ($PlexToken) {
                                        $Arturl = $plexurl + $global:PlexTitleCardUrl + "?X-Plex-Token=$PlexToken"
                                    }
                                    Else {
                                        $Arturl = $plexurl + $global:PlexTitleCardUrl
                                    }
                                    # now search for TitleCards
                                    if ($global:FavProvider -eq 'TMDB') {
                                        if ($episode.tmdbid) {
                                            $global:posterurl = GetTMDBTitleCard
                                            if ($global:Fallback -eq "TVDB") {
                                                $global:posterurl = GetTVDBTitleCard
                                            }
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                            if (!$global:posterurl ) {
                                                # Lets just try to grab a background poster.
                                                Write-Entry -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:posterurl = GetTMDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                    $global:IsFallback = $true
                                                }
                                                Else {
                                                    # Lets just try to grab a background poster.
                                                    $global:posterurl = GetTVDBShowBackground
                                                    if ($global:posterurl) {
                                                        Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                        $global:IsFallback = $true
                                                    }
                                                }
                                            }
                                        }
                                        else {
                                            Write-Entry -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                            $global:posterurl = GetTVDBTitleCard
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                            if (!$global:posterurl ) {
                                                Write-Entry -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                # Lets just try to grab a background poster.
                                                Write-Entry -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:posterurl = GetTVDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                    $global:IsFallback = $true
                                                }
                                            }
                                        }
                                    }
                                    Else {
                                        if ($episode.tvdbid) {
                                            $global:posterurl = GetTVDBTitleCard
                                            if ($global:Fallback -eq "TMDB") {
                                                $global:posterurl = GetTMDBTitleCard
                                            }
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                            if (!$global:posterurl ) {
                                                # Lets just try to grab a background poster.
                                                Write-Entry -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:posterurl = GetTVDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                    $global:IsFallback = $true
                                                }
                                                Else {
                                                    # Lets just try to grab a background poster.
                                                    $global:posterurl = GetTMDBShowBackground
                                                    if ($global:posterurl) {
                                                        Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                        $global:IsFallback = $true
                                                    }
                                                }
                                            }
                                        }
                                        else {
                                            Write-Entry -Subtext "Can't search on TVDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                            $global:posterurl = GetTMDBTitleCard
                                            if (!$global:posterurl) {
                                                $global:IsFallback = $true
                                                if ($entry.PlexTitleCardUrl) {
                                                    GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Plex TitleCard Url empty, cannot search on plex, likely there is no artwork on plex..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }
                                                if (!$global:posterurl) {
                                                    Write-Entry -Subtext "Could not find a TitleCard on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                }
                                            }
                                            if (!$global:posterurl ) {
                                                # Lets just try to grab a background poster.
                                                Write-Entry -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:posterurl = GetTMDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Entry -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                    $global:IsFallback = $true
                                                }
                                            }
                                        }
                                    }
                                    if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                                        if ($global:ImageProcessing -eq 'true') {
                                            try {
                                                if (!$global:PlexartworkDownloaded) {
                                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage -ErrorAction Stop
                                                }
                                            }
                                            catch {
                                                $statusCode = $_.Exception.Response.StatusCode.value__
                                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                $errorCount++
                                            }
                                            Write-Entry -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TMDBAssetTextLang
                                                if ($global:FavProvider -ne 'TMDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TVDBAssetTextLang
                                                if ($global:FavProvider -ne 'TVDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like "$PlexUrl*") {
                                                Write-Entry -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                if ($global:FavProvider -ne 'PLEX') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                $CommentArguments = "convert `"$EpisodeImage`" -set `"comment`" `"created with ppm`" `"$EpisodeImage`""
                                                $CommentlogEntry = "`"$magick`" $CommentArguments"
                                                $CommentlogEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                InvokeMagickCommand -Command $magick -Arguments $CommentArguments
                                                if (!$global:ImageMagickError -eq 'True') {
                                                    # Resize Image to 2000x3000 and apply Border and overlay
                                                    if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'true') {
                                                        $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                        Write-Entry -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                    }
                                                    if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'false') {
                                                        $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                        Write-Entry -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                    }
                                                    if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'true') {
                                                        $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite `"$EpisodeImage`""
                                                        Write-Entry -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                    }
                                                    if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'false') {
                                                        $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                        Write-Entry -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                    }
                                                    $logEntry = "`"$magick`" $Arguments"
                                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                    InvokeMagickCommand -Command $magick -Arguments $Arguments

                                                    if ($AddTitleCardEPTitleText -eq 'true') {
                                                        if ($TitleCardEPTitlefontAllCaps -eq 'true') {
                                                            $global:EPTitle = $global:EPTitle.ToUpper()
                                                        }
                                                        $global:EPTitle = $global:EPTitle -replace '"', '""'
                                                        $joinedTitlePointSize = $global:EPTitle -replace '""', '""""'
                                                        $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $TitleCardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
                                                        if (!$global:IsTruncated) {
                                                            Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

                                                            $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPTitlefontcolor`" -size `"$TitleCardEPTitleboxsize`" -background none caption:`"$global:EPTitle`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" `) -gravity south -geometry +0`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""

                                                            Write-Entry -Subtext "Applying EPTitle text: `"$global:EPTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                            $logEntry = "`"$magick`" $Arguments"
                                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                            InvokeMagickCommand -Command $magick -Arguments $Arguments
                                                        }
                                                    }
                                                    if ($AddTitleCardEPText -eq 'true') {
                                                        if ($TitleCardEPfontAllCaps -eq 'true') {
                                                            $global:SeasonEPNumber = $global:SeasonEPNumber.ToUpper()
                                                        }
                                                        $global:SeasonEPNumber = $global:SeasonEPNumber -replace '"', '""'
                                                        $joinedTitlePointSize = $global:SeasonEPNumber -replace '""', '""""'
                                                        $optimalFontSize = Get-OptimalPointSize -text $joinedTitlePointSize -font $TitleCardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
                                                        if (!$global:IsTruncated) {
                                                            Write-Entry -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info

                                                            $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPfontcolor`" -size `"$TitleCardEPboxsize`" -background none caption:`"$global:SeasonEPNumber`" -trim -gravity south -extent `"$TitleCardEPboxsize`" `) -gravity south -geometry +0`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""

                                                            Write-Entry -Subtext "Applying SeasonEPNumber text: `"$global:SeasonEPNumber`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                            $logEntry = "`"$magick`" $Arguments"
                                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                            InvokeMagickCommand -Command $magick -Arguments $Arguments
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        Else {
                                            try {
                                                if (!$global:PlexartworkDownloaded) {
                                                    $response = Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage -ErrorAction Stop
                                                }
                                            }
                                            catch {
                                                $statusCode = $_.Exception.Response.StatusCode.value__
                                                Write-Entry -Subtext "An error occurred while downloading the artwork: HTTP Error $statusCode" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                                $errorCount++
                                            }
                                            Write-Entry -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TMDBAssetTextLang
                                                if ($global:FavProvider -ne 'TMDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                                Write-Entry -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                $global:AssetTextLang = $global:TVDBAssetTextLang
                                                if ($global:FavProvider -ne 'TVDB') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if ($global:posterurl -like "$PlexUrl*") {
                                                Write-Entry -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color DarkMagenta -log Info
                                                if ($global:FavProvider -ne 'PLEX') {
                                                    $global:IsFallback = $true
                                                }
                                            }
                                            if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                # Resize Image to 2000x3000
                                                $Resizeargument = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                Write-Entry -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
                                                $logEntry = "`"$magick`" $Resizeargument"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append
                                                InvokeMagickCommand -Command $magick -Arguments $Resizeargument
                                            }
                                        }
                                        if (!$global:ImageMagickError -eq 'True') {
                                            if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                                # Move file back to original naming with Brackets.
                                                if (!$global:IsTruncated) {
                                                    Move-Item -LiteralPath $EpisodeImage -destination $EpisodeImageoriginal -Force -ErrorAction SilentlyContinue
                                                    Write-Entry -Subtext "Added: $EpisodeImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
                                                    Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                                    $EpisodeCount++
                                                    $posterCount++
                                                }
                                                Else {
                                                    Write-Entry -Subtext "Skipping asset move because text is truncated..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Warning
                                                }

                                                $episodetemp = New-Object psobject
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($global:FileNaming + " | " + $global:EPTitle)
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Episode'
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Language" -Value $(if (!$global:AssetTextLang) { "Textless" }Else { $global:AssetTextLang })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                                $episodetemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $global:posterurl
                                                switch -Wildcard ($global:FavProvider) {
                                                    'TMDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                                    'FANART' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                                    'TVDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                                    Default { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                                }
                                                # Export the array to a CSV file
                                                $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                            }
                                        }
                                    }
                                    Else {
                                        Write-Entry -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Color White -log Info
                                        Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
                                        if ($global:OnlyTextless) {
                                            $episodetemp = New-Object psobject
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Language" -Value "N/A"
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value "N/A"
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                            $episodetemp | Add-Member -MemberType NoteProperty -Name "Download Source" -Value "N/A"
                                            switch -Wildcard ($global:FavProvider) {
                                                'TMDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TMDBAssetChangeUrl) { $global:TMDBAssetChangeUrl }Else { "N/A" }) }
                                                'FANART' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:FANARTAssetChangeUrl) { $global:FANARTAssetChangeUrl }Else { "N/A" }) }
                                                'TVDB' { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $(if ($global:TVDBAssetChangeUrl) { $global:TVDBAssetChangeUrl }Else { "N/A" }) }
                                                Default { $episodetemp | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value "N/A" }
                                            }
                                        
                                            # Export the array to a CSV file
                                            $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                        }
                                        $errorCount++
                                    }

                                }
                                else {
                                    if ($show_skipped -eq 'True' ) {
                                        Write-Entry -Subtext "Already exists: $EpisodeImageoriginal" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Cyan -log Info
                                    }
                                }
                            }
                        }
                    }

                }
            }
        }
        Else {
            Write-Entry -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            Write-Entry -Subtext "[ERROR-HERE] See above. ^^^" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Red -log Error
            $errorCount++
        }
    }
    $endTime = Get-Date
    $executionTime = New-TimeSpan -Start $startTime -End $endTime
    # Format the execution time
    $hours = [math]::Floor($executionTime.TotalHours)
    $minutes = $executionTime.Minutes
    $seconds = $executionTime.Seconds
    $FormattedTimespawn = $hours.ToString() + "h " + $minutes.ToString() + "m " + $seconds.ToString() + "s "

    Write-Entry -Message "Finished, Total images created: $posterCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
    if ($posterCount -ge '1') {
        Write-Entry -Message "Show/Movie Posters created: $($posterCount-$SeasonCount-$BackgroundCount-$EpisodeCount)| Season images created: $SeasonCount | Background images created: $BackgroundCount | TitleCards created: $EpisodeCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Green -log Info
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageChoices.csv)) {
        Write-Entry -Message "You can find a detailed Summary of image Choices here: $global:ScriptRoot\Logs\ImageChoices.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
        # Calculate Summary
        $SummaryCount = Import-Csv -LiteralPath "$global:ScriptRoot\Logs\ImageChoices.csv" -Delimiter ';'
        $FallbackCount = @($SummaryCount | Where-Object Fallback -eq 'True')
        $TextlessCount = @($SummaryCount | Where-Object Language -eq 'Textless')
        $TextTruncatedCount = @($SummaryCount | Where-Object TextTruncated -eq 'True')
        $TextCount = @($SummaryCount | Where-Object Textless -eq 'False')
        if ($TextlessCount -or $FallbackCount -or $TextCount -or $PosterUnknownCount -or $TextTruncatedCount) {
            Write-Entry -Message "This is a subset summary of all image choices from the ImageChoices.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
        if ($TextlessCount) {
            Write-Entry -Subtext "'$($TextlessCount.count)' times the script took a Textless image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
        if ($FallbackCount) {
            Write-Entry -Subtext "'$($FallbackCount.count)' times the script took a fallback image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
            Write-Entry -Subtext "'$($posterCount-$($FallbackCount.count))' times the script took the image from fav provider: $global:FavProvider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
        if ($TextCount) {
            Write-Entry -Subtext "'$($TextCount.count)' times the script took an image with Text" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
        if ($PosterUnknownCount -ge '1') {
            Write-Entry -Subtext "'$PosterUnknownCount' times the script took a season poster where we cannot tell if it has text or not" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
        if ($TextTruncatedCount) {
            Write-Entry -Subtext "'$($TextTruncatedCount.count)' times the script truncated the text in images" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color Yellow -log Info
        }
    }
    if ($errorCount -ge '1') {
        Write-Entry -Message "During execution '$errorCount' Errors occurred, please check the log for a detailed description where you see [ERROR-HERE]." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
    if (!(Get-ChildItem -LiteralPath "$global:ScriptRoot\Logs\ImageChoices.csv" -ErrorAction SilentlyContinue)) {
        $ImageChoicesDummycsv = New-Object psobject

        # Add members to the object with empty values
        $ImageChoicesDummycsv = New-Object psobject
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Title" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Type" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Language" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Download Source" -Value $null
        $ImageChoicesDummycsv | Add-Member -MemberType NoteProperty -Name "Fav Provider Link" -Value $null

        $ImageChoicesDummycsv | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        Write-Entry -Message "No ImageChoices.csv found, creating dummy file for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    }
    Write-Entry -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Scriptlog.log -Color White -log Info
    # Send Notification when running in Docker
    if ($global:NotifyUrl -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
        if ($global:NotifyUrl -like '*discord*') {
            $jsonPayload = @"
        {
            "username": "Plex-Poster-Maker",
            "avatar_url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png",
            "content": "",
            "embeds": [
            {
                "author": {
                "name": "PPM @Github",
                "url": "https://github.com/fscorrupt/Plex-Poster-Maker"
                },
                "description": "PPM run took: $FormattedTimespawn $(if ($errorCount -ge '1') {"\n During execution Errors occurred, please check log for detailed description."})",
                "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                "color": $(if ($errorCount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                "fields": [
                {
                    "name": "",
                    "value": ":bar_chart:",
                    "inline": false
                },
                {
                    "name": "Errors",
                    "value": "$errorCount",
                    "inline": false
                },
                {
                    "name": "Fallbacks",
                    "value": "$($FallbackCount.count)",
                    "inline": true
                },
                {
                    "name": "Textless",
                    "value": "$($TextlessCount.count)",
                    "inline": true
                },
                {
                    "name": "Truncated",
                    "value": "$($TextTruncatedCount.count)",
                    "inline": true
                },
                {
                    "name": "Unknown",
                    "value": "$PosterUnknownCount",
                    "inline": true
                },
                {
                    "name": "",
                    "value": ":frame_photo:",
                    "inline": false
                },
                {
                    "name": "Posters",
                    "value": "$($posterCount-$SeasonCount-$BackgroundCount-$EpisodeCount)",
                    "inline": false
                },
                {
                    "name": "Backgrounds",
                    "value": "$BackgroundCount",
                    "inline": true
                },
                {
                    "name": "Seasons",
                    "value": "$SeasonCount",
                    "inline": true
                },
                {
                    "name": "TitleCards",
                    "value": "$EpisodeCount",
                    "inline": true
                }
                ],
                "thumbnail": {
                    "url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png"
                },
                "footer": {
                    "text": "$Platform  | current - v$CurrentScriptVersion  | latest - v$LatestScriptVersion"
                }
            }
            ]
        }
"@
            $global:NotifyUrl = $global:NotifyUrl.replace('discord://', 'https://discord.com/api/webhooks/')
            if ($global:SendNotification -eq 'True') {
                Push-ObjectToDiscord -strDiscordWebhook $global:NotifyUrl -objPayload $jsonPayload
            }
        }
        Else {
            if ($global:SendNotification -eq 'True') {
                if ($errorCount -ge '1') {
                    apprise --notification-type="error" --title="Plex-Poster-Maker" --body="PPM run took: $FormattedTimespawn`nIt Created '$posterCount' Images`n`nDuring execution '$errorCount' Errors occurred, please check log for detailed description." "$global:NotifyUrl"
                }
                Else {
                    apprise --notification-type="success" --title="Plex-Poster-Maker" --body="PPM run took: $FormattedTimespawn`nIt Created '$posterCount' Images" "$global:NotifyUrl"
                }
            }
        }
    }
    if ($global:NotifyUrl -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -notlike 'PSDocker-Alpine*') {
        $jsonPayload = @"
        {
            "username": "Plex-Poster-Maker",
            "avatar_url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png",
            "content": "",
            "embeds": [
            {
                "author": {
                "name": "PPM @Github",
                "url": "https://github.com/fscorrupt/Plex-Poster-Maker"
                },
                "description": "PPM run took: $FormattedTimespawn $(if ($errorCount -ge '1') {"\n During execution Errors occurred, please check log for detailed description."})",
                "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                "color": $(if ($errorCount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                "fields": [
                {
                    "name": "",
                    "value": ":bar_chart:",
                    "inline": false
                },
                {
                    "name": "Errors",
                    "value": "$errorCount",
                    "inline": false
                },
                {
                    "name": "Fallbacks",
                    "value": "$($FallbackCount.count)",
                    "inline": true
                },
                {
                    "name": "Textless",
                    "value": "$($TextlessCount.count)",
                    "inline": true
                },
                {
                    "name": "Truncated",
                    "value": "$($TextTruncatedCount.count)",
                    "inline": true
                },
                {
                    "name": "Unknown",
                    "value": "$PosterUnknownCount",
                    "inline": true
                },
                {
                    "name": "",
                    "value": ":frame_photo:",
                    "inline": false
                },
                {
                    "name": "Posters",
                    "value": "$($posterCount-$SeasonCount-$BackgroundCount-$EpisodeCount)",
                    "inline": false
                },
                {
                    "name": "Backgrounds",
                    "value": "$BackgroundCount",
                    "inline": true
                },
                {
                    "name": "Seasons",
                    "value": "$SeasonCount",
                    "inline": true
                },
                {
                    "name": "TitleCards",
                    "value": "$EpisodeCount",
                    "inline": true
                }
                ],
                "thumbnail": {
                    "url": "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/images/webhook.png"
                },
                "footer": {
                    "text": "$Platform  | current - v$CurrentScriptVersion  | latest - v$LatestScriptVersion"
                }

            }
            ]
        }
"@
        if ($global:SendNotification -eq 'True') {
            Push-ObjectToDiscord -strDiscordWebhook $global:NotifyUrl -objPayload $jsonPayload
        }
    }
}
