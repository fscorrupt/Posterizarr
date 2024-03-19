param (
    [switch]$Manual,
    [switch]$Testing
)

$CurrentScriptVersion = "1.0.12"
$global:HeaderWritten = $false

#################
# What you need #
#####################################################################################################################
# TMDB API Read Access Token    -> https://www.themoviedb.org/settings/api
# FANART API                    -> https://fanart.tv/get-an-api-key
# TVDB API                      -> https://thetvdb.com/api-information/signup
# ImageMagick                   -> https://imagemagick.org/archive/binaries/ImageMagick-7.1.1-27-Q16-HDRI-x64-dll.exe
# FanartTvAPI Module            -> https://github.com/Celerium/FanartTV-PowerShellWrapper
#####################################################################################################################
function Write-Log {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Info', 'Warning', 'Error', 'Optional', 'Debug', 'Trace', 'Success')]
        [string]$Type,

        [string]$Subtext = $null
    )
    switch ($Type) {
        'Info' { $Color = "white" }
        'Warning' { $Color = "yellow" }
        'Error' { $Color = "red" }
        'Optional' { $Color = "blue" }
        'Debug' { $Color = "darkmagenta" }
        'Trace' { $Color = "cyan" }
        'Success' { $Color = "green" }
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

===============================================================================
"@
        Write-Host $Header
        $Header | Out-File $Path -Append 
        $global:HeaderWritten = $true
    }
    $Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $PaddedType = "[" + $Type + "]"
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
        Write-Log -Subtext "Text truncated! optimalFontSize: $current_pointsize below min_pointsize: $min_pointsize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:IsTruncated = $true
        $current_pointsize = $min_pointsize
    }

    # Return optimal point size
    return $current_pointsize
}
function GetTMDBMoviePoster {
    Write-Log -Subtext "Searching on TMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-Log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBMovieBackground {
    Write-Log -Subtext "Searching on TMDB for a movie background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-Log -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Log -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/movie/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBShowPoster {
    Write-Log -Subtext "Searching on TMDB for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                $NoLangPoster = ($response.images.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-Log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    return $global:posterurl
                }
                Else {
                    $posterpath = (($response.images.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
        }
        catch {
        }
        if ($response) {
            if ($response.images.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBSeasonPoster {
    Write-Log -Subtext "Searching on TMDB for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue            
        }
        catch {
        }
        if ($response) {
            if ($response.posters) {
                $NoLangPoster = ($response.posters | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.posters | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-Log -Subtext "Found Poster with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    $global:TMDBSeasonFallback = $global:posterurl
                    return $global:posterurl
                }
                Else {
                    $posterpath = (($response.posters | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Log -Subtext "Found Textless Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
            }
            Else {
                Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            }
        }
        Else {
            Write-Log -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    Else {
        try {
            if ($global:SeasonNumber -match '\b\d{1,2}\b') {
                $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$global:SeasonNumber/images?append_to_response=images&language=$($global:PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
            Else {
                $responseBackup = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue
            }
        }
        catch {
        }
        if ($responseBackup) {
            if ($responseBackup.images.posters) {
                Write-Log -Subtext "Could not get a result with '$global:SeasonNumber' on TMDB, likley season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
        }
        if ($response) {
            if ($response.posters) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found Poster without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found Poster with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
            }
            Else {
                Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            }
        }
        Else {
            Write-Log -Subtext "No Season Poster on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }

    }
}
function GetTMDBShowBackground {
    Write-Log -Subtext "Searching on TMDB for a show background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                $NoLangPoster = ($response.images.backdrops | Where-Object iso_639_1 -eq $null)
                if (!$NoLangPoster) {
                    $posterpath = (($response.images.backdrops | Sort-Object vote_average -Descending)[0]).file_path
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    if ($global:FavProvider -eq 'TMDB') {
                        $global:Fallback = "fanart"
                        $global:tmdbfallbackposterurl = $global:posterurl
                    }
                    Write-Log -Subtext "Found background with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                }
                Else {
                    $posterpath = (($response.images.backdrops | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                    if ($posterpath) {
                        $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                        Write-Log -Subtext "Found Textless background on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        return $global:posterurl
                    }
                }
                if (!$global:posterurl) {
                    Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
    Else {
        try {
            $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)?append_to_response=images&language=$($PreferedLanguageOrder[0])&include_image_language=$($global:PreferedLanguageOrderTMDB -join ',')" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue    
        }
        catch {
        }
        if ($response) {
            if ($response.images.backdrops) {
                foreach ($lang in $global:PreferedLanguageOrderTMDB) {
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
                            Write-Log -Subtext "Found background without Language on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        Else {
                            Write-Log -Subtext "Found background with Language '$lang' on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        }
                        if ($lang -ne 'null') {
                            $global:PosterWithText = $true
                        }
                        return $global:posterurl
                        break
                    }
                }
                if (!$global:posterurl) {
                    Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $global:Fallback = "fanart"
                }
            }
            Else {
                Write-Log -Subtext "No Background found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                if ($global:FavProvider -eq 'TMDB') {
                    $global:Fallback = "fanart"
                }
            }
        }
        Else {
            Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTMDBTitleCard {
    Write-Log -Subtext "Searching on TMDB for: $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    try {
        $response = (Invoke-WebRequest -Uri "https://api.themoviedb.org/3/tv/$($global:tmdbid)/season/$($global:season_number)/episode/$($global:episodenumber)/images?append_to_response=images&language=xx&include_image_language=en,null,de" -Method GET -Headers $global:headers -ErrorAction SilentlyContinue).content | ConvertFrom-Json -ErrorAction SilentlyContinue            
    }
    catch {
    }
    if ($response) {
        if ($response.stills) {
            $NoLangPoster = ($response.stills | Where-Object iso_639_1 -eq $null)
            if (!$NoLangPoster) {
                $posterpath = (($response.stills | Sort-Object vote_average -Descending)[0]).file_path
                $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                Write-Log -Subtext "Found Title Card with text on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                $global:PosterWithText = $true
                return $global:posterurl
            }
            Else {
                $posterpath = (($response.stills | Where-Object iso_639_1 -eq $null | Sort-Object vote_average -Descending)[0]).file_path
                if ($posterpath) {
                    $global:posterurl = "https://image.tmdb.org/t/p/original$posterpath"
                    Write-Log -Subtext "Found Textless Title Card on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    return $global:posterurl
                }
            }
        }
        Else {
            Write-Log -Subtext "No Title Card found on TMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type error
            $global:Fallback = "TVDB"
            $Errorcount++
        }
    }
    Else {
        Write-Log -Subtext "TMDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TVDB"
        $Errorcount++
    }
}
function GetFanartMoviePoster {
    $global:Fallback = $null
    Write-Log -Subtext "Searching on Fanart.tv for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null
        
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.movieposter) {
                    if (!($entrytemp.movieposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.movieposter)[0].url
                        Write-Log -Subtext "Found Poster with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:PosterWithText = $true
                        if ($global:FavProvider -eq 'FANART') {
                            $global:Fallback = "TMDB"
                            $global:fanartfallbackposterurl = ($entrytemp.movieposter)[0].url
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.movieposter | Where-Object lang -eq '00')[0].url
                        Write-Log -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-Log -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
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
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        if (($entrytemp.movieposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.movieposter)[0].url
                            if ($lang -eq '00') {
                                Write-Log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {
            Write-Log -Subtext "No movie match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartMovieBackground {
    $global:Fallback = $null
    Write-Log -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
        
    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type movies -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.moviebackground) {
                if (!($entrytemp.moviebackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.moviebackground)[0].url
                    Write-Log -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.moviebackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.moviebackground | Where-Object lang -eq '')[0].url
                    Write-Log -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    break
                }
            }
        }
    }
    if (!$global:posterurl) {
        Write-Log -Subtext "No movie match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
    }

}
function GetFanartShowPoster {
    $global:Fallback = $null
    Write-Log -Subtext "Searching on Fanart.tv for a show poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    if ($global:PreferTextless -eq 'True') {
        $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
        $entrytemp = $null

        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp -and $entrytemp.tvposter) {
                    if (!($entrytemp.tvposter | Where-Object lang -eq '00')) {
                        $global:posterurl = ($entrytemp.tvposter)[0].url

                        Write-Log -Subtext "Found Poster with text on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:PosterWithText = $true
                        if ($global:FavProvider -eq 'FANART') {
                            $global:Fallback = "TMDB"
                            $global:fanartfallbackposterurl = ($entrytemp.tvposter)[0].url
                        }
                        break
                    }
                    Else {
                        $global:posterurl = ($entrytemp.tvposter | Where-Object lang -eq '00')[0].url
                        Write-Log -Subtext "Found Textless Poster on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                        $global:TextlessPoster = $true
                        break
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-Log -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            
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
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                            $global:posterurl = ($entrytemp.tvposter)[0].url
                            if ($lang -eq '00') {
                                Write-Log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne '00') {
                                $global:PosterWithText = $true
                            }
                            break
                        }
                    }
                }
            }
        }

        if (!$global:posterurl) {

            Write-Log -Subtext "No show match or poster found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            
            $global:Fallback = "TMDB"
        }
        Else {
            return $global:posterurl
        }
    }
}
function GetFanartShowBackground {
    $global:Fallback = $null
    Write-Log -Subtext "Searching on Fanart.tv for a Background poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $ids = @($global:tmdbid, $global:tvdbid, $global:imdbid)
    $entrytemp = $null
        
    foreach ($id in $ids) {
        if ($id) {
            $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
            if ($entrytemp -and $entrytemp.showbackground) {
                if (!($entrytemp.showbackground | Where-Object lang -eq '')) {
                    $global:posterurl = ($entrytemp.showbackground)[0].url
                    Write-Log -Subtext "Found Background with text on Fanart.tv"  -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:PosterWithText = $true
                    if ($global:FavProvider -eq 'FANART') {
                        $global:Fallback = "TMDB"
                        $global:fanartfallbackposterurl = ($entrytemp.showbackground)[0].url
                    }
                    break
                }
                Else {
                    $global:posterurl = ($entrytemp.showbackground | Where-Object lang -eq '')[0].url
                    Write-Log -Subtext "Found Textless background on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
                    $global:TextlessPoster = $true
                    break
                }
            }
        }
    }

    if (!$global:posterurl) {
        Write-Log -Subtext "No show match or background found on Fanart.tv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        $global:Fallback = "TMDB"
    }
    Else {
        return $global:posterurl
    }
    
}
function GetFanartSeasonPoster {
    Write-Log -Subtext "Searching on Fanart.tv for Season '$global:SeasonNumber' poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
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
                            Write-Log -Subtext "Found Season Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            $global:TextlessPoster = $true
                        }
                        Else {
                            Write-Log -Subtext "No Texless Season Poster on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            foreach ($lang in $global:PreferedLanguageOrderFanart) {
                                $FoundPoster = ($entrytemp.seasonposter | Where-Object { $_.lang -eq "$lang" -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)
                                if ($FoundPoster) {
                                    $global:posterurl = $FoundPoster[0].url
                                    Write-Log -Subtext "Found season Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                    $global:PosterWithText = $true
                                    break
                                }
                            }
                        }
                    }
                    Else {
                        Write-Log -Subtext "Could not get a result with '$global:SeasonNumber' on Fanart, likley season number not in correct format, fallback to Show poster." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        if ($entrytemp -and $entrytemp.tvposter) {
                            foreach ($lang in $global:PreferedLanguageOrderFanart) {
                                if (($entrytemp.tvposter | Where-Object lang -eq "$lang")) {
                                    $global:posterurl = ($entrytemp.tvposter)[0].url
                                    if ($lang -eq '00') {
                                        Write-Log -Subtext "Found Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                        $global:TextlessPoster = $true
                                    }
                                    Else {
                                        Write-Log -Subtext "Found Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                    }
                                    if ($lang -ne '00') {
                                        $global:PosterWithText = $true
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
            Write-Log -Subtext "Found season poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            return $global:posterurl
        }
        Else {
            Write-Log -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    Else {
        foreach ($id in $ids) {
            if ($id) {
                $entrytemp = Get-FanartTv -Type tv -id $id -ErrorAction SilentlyContinue
                if ($entrytemp.seasonposter) {
                    foreach ($lang in $global:PreferedLanguageOrderFanart) {
                        $FoundPoster = ($entrytemp.seasonposter | Where-Object { $_.lang -eq "$lang" -and $_.Season -eq $global:SeasonNumber } | Sort-Object likes)
                        if ($FoundPoster) {
                            $global:posterurl = $FoundPoster[0].url
                        }
                        if ($global:posterurl) {
                            if ($lang -eq '00') {
                                Write-Log -Subtext "Found season Poster without Language on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                $global:TextlessPoster = $true
                            }
                            Else {
                                Write-Log -Subtext "Found season Poster with Language '$lang' on FANART" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                $global:PosterWithText = $true
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
            Write-Log -Subtext "No Season Poster on Fanart" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
}
function GetTVDBMoviePoster {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-Log -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurl = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '14' } | Sort-Object Score)[0].image
                    Write-Log -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    return $global:posterurl
                }
                Else {
                    Write-Log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            Write-Log -Subtext "Searching on TVDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '14' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Log -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                }
                Else {
                    Write-Log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBMovieBackground {
    if ($global:tvdbid) {
        if ($global:PreferTextless -eq 'True') {
            Write-Log -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    $global:posterurl = ($response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '15' } | Sort-Object Score)[0].image
                    Write-Log -Subtext "Found Textless Background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    return $global:posterurl
                }
                Else {
                    Write-Log -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            Write-Log -Subtext "Searching on TVDB for a movie Background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/movies/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data.artworks) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '15' } | Sort-Object Score)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Log -Subtext "Found Background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found Background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-Log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    }
                }
                Else {
                    Write-Log -Subtext "No Background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBShowPoster {
    if ($global:tvdbid) {
        Write-Log -Subtext "Searching on TVDB for a poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '2' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-Log -Subtext "Found Textless Poster on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:TextlessPoster = $true
                    }
                    Else {
                        $global:posterurl = $defaultImageurl
                        Write-Log -Subtext "Found Poster with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    }
                    return $global:posterurl
                }
                Else {
                    Write-Log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '2' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '2' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Log -Subtext "Found Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                }
                Else {
                    Write-Log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBSeasonPoster {
    if ($global:tvdbid) {
        Write-Log -Subtext "Searching on TVDB for a Season poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/extended" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
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
                }
                if ($Seasonresponse) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($Seasonresponse.data.artwork | Where-Object { $_.language -like "" -and $_.type -eq '7' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($Seasonresponse.data.artwork  | Where-Object { $_.language -like "$lang*" -and $_.type -eq '7' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Log -Subtext "Found Season Poster without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                                $global:TextlessPoster = $true
                            }
                            Else {
                                Write-Log -Subtext "Found Season Poster with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                }
                return $global:posterurl
            }
            Else {
                Write-Log -Subtext "No Poster found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            }
        }
        Else {
            Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        }
    }
}
function GetTVDBShowBackground {
    if ($global:tvdbid) {
        Write-Log -Subtext "Searching on TVDB for a background" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        if ($global:PreferTextless -eq 'True') {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    $defaultImageurl = $response.data.image
                    $NoLangImageUrl = $response.data.artworks | Where-Object { $_.language -eq $null -and $_.type -eq '3' }
                    if ($NoLangImageUrl) {
                        $global:posterurl = $NoLangImageUrl[0].image
                        Write-Log -Subtext "Found Textless background on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                        $global:TextlessPoster = $true
                    }
                    Else {
                        $global:posterurl = $defaultImageurl
                        Write-Log -Subtext "Found background with text on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    }
                    return $global:posterurl
                }
                Else {
                    Write-Log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
        Else {
            try {
                $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/artworks" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
            }
            catch {
            }
            if ($response) {
                if ($response.data) {
                    foreach ($lang in $global:PreferedLanguageOrderTVDB) {
                        if ($lang -eq 'null') {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        Else {
                            $LangArtwork = ($response.data.artworks | Where-Object { $_.language -like "$lang*" -and $_.type -eq '3' } | Sort-Object Score -Descending)
                        }
                        if ($LangArtwork) {
                            $global:posterurl = $LangArtwork[0].image
                            if ($lang -eq 'null') {
                                Write-Log -Subtext "Found background without Language on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            Else {
                                Write-Log -Subtext "Found background with Language '$lang' on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                            }
                            if ($lang -ne 'null') {
                                $global:PosterWithText = $true
                            }
                            return $global:posterurl
                            break
                        }
                    }
                    if (!$global:posterurl) {
                        Write-Log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    }
                }
                Else {
                    Write-Log -Subtext "No background found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                }
            }
            Else {
                Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            }
        }
    }
}
function GetTVDBTitleCard {
    if ($global:tvdbid) {
        Write-Log -Subtext "Searching on TVDB for: $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
        try {
            $response = (Invoke-WebRequest -Uri "https://api4.thetvdb.com/v4/series/$($global:tvdbid)/episodes/default?" -Method GET -Headers $global:tvdbheader).content | ConvertFrom-Json
        }
        catch {
        }
        if ($response) {
            if ($response.data.episodes) {
                $global:NoLangImageUrl = $response.data.episodes | Where-Object { $_.seasonNumber -eq $global:season_number -and $_.number -eq $global:episodenumber }
                if ($global:NoLangImageUrl.image) {
                    $global:posterurl = $global:NoLangImageUrl.image
                    Write-Log -Subtext "Found Title Card on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
                    $global:TextlessPoster = $true
                    return $global:NoLangImageUrl.image
                }
                Else {
                    Write-Log -Subtext "No Title Card found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                    $Errorcount++
                }
            }
            Else {
                Write-Log -Subtext "No Title Card found on TVDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                $Errorcount++
            }
        }
        Else {
            Write-Log -Subtext "TVDB Api Response is null" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            $Errorcount++
        }
    }
}
function GetIMDBPoster {
    $response = Invoke-WebRequest -Uri "https://www.imdb.com/title/$($global:imdbid)/mediaviewer" -Method GET
    $global:posterurl = $response.images.src[1]
    if (!$global:posterurl) {
        Write-Log -Subtext "No show match or poster found on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    }
    Else {
        Write-Log -Subtext "Found Poster with text on IMDB" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Optional
        return $global:posterurl
    }
}
function GetPlexArtwork {
    param(
        [string]$Type,
        [string]$ArtUrl,
        [string]$TempImage
    )
    Write-Log -Subtext "Searching on Plex for$Type" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    try {
        Invoke-WebRequest -Uri $ArtUrl -OutFile $TempImage
    }
    catch {
        Write-Log -Subtext "Could not download Artwork from plex, Error Message: $_" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        $errorCount++
        break
    }

    $magickcommand = "& `"$magick`" identify -verbose `"$TempImage`""
    $magickcommand | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 

    # Get the EXIF data
    $ExifFound = $null
    # Execute command and get exif data
    $value = (Invoke-Expression $magickcommand | Select-String -Pattern 'overlay|titlecard')

    $global:PlexartworkDownloaded = $null
    if ($value) {
        $ExifFound = $True
        Write-Log -Subtext "Artwork has exif data from pmm/tcm, cant take it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        Remove-Item -LiteralPath $TempImage | out-null
    }
    Else {
        Write-Log -Subtext "No pmm/tcm exif data found, taking Plex artwork..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
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
        Write-Host "Unable to send to Discord. $($_)" -ForegroundColor Red
        Write-Host $objPayload
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
        # Download the default configuration JSON file from the URL
        $defaultConfig = Invoke-RestMethod -Uri $jsonExampleUrl -Method Get -ErrorAction Stop

        # Read the existing configuration file if it exists
        if (Test-Path $jsonFilePath) {
            try {
                $config = Get-Content -Path $jsonFilePath -Raw | ConvertFrom-Json
            }
            catch {
                Write-Log -Message "Failed to read the existing configuration file: $jsonFilePath. Please ensure it is valid JSON. Aborting..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                Exit
            }
        }
        else {
            $config = @{}
        }

        # Check and add missing keys from the default configuration
        foreach ($partKey in $defaultConfig.PSObject.Properties.Name) {
            # Check if the part exists in the current configuration
            if (-not $config.$partKey) {
                Write-Log -Message "Missing Main Attribute in your Config file: $partKey." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                Write-Log -Message "In GH Readme, look for $partKey, then review your config file and adjust it accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                Write-Log -Message "GH Readme -> https://github.com/fscorrupt/Plex-Poster-Maker/blob/main/README.md#configuration, Exiting now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                Exit
            }
            else {
                # Check each key in the part
                foreach ($propertyKey in $defaultConfig.$partKey.PSObject.Properties.Name) {
                    # Show user that a sub-attribute is missing
                    if (-not $config.$partKey.PSObject.Properties.Name.Contains($propertyKey)) {
                        Write-Log -Message "Missing Sub-Attribute in your Config file: $partKey.$propertyKey." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                        Write-Log -Message "In GH Readme, look for $partKey and $propertyKey, then review your config file and adjust it accordingly." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                        Write-Log -Message "GH Readme -> https://github.com/fscorrupt/Plex-Poster-Maker/blob/main/README.md#configuration, Exiting now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                        Exit
                    }
                }
            }
        }
    }
    catch [System.Net.WebException] {
        Write-Log -Message "Failed to download the default configuration JSON file from the URL. Please check your internet connection and URL: $jsonExampleUrl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        Exit
    }
    catch {
        Write-Log -Message "An unexpected error occurred: $_" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
            Write-Log -Message "Could not find file in: $path" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            Write-Log -Subtext "Check config for typos and make sure that the file is present in scriptroot." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
            $errorCount++
        }
    }

    if ($errorCount -ge 1) {
        Exit
    } 
}

$startTime = Get-Date
$global:OSType = [System.Environment]::OSVersion.Platform
if ($env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
    $global:OSType = "DockerAlpine"
    $ProgressPreference = 'SilentlyContinue'
    $global:ScriptRoot = "./config"
}
Else {
    $global:ScriptRoot = $PSScriptRoot
}
# Check if Config file is present
if (!(Test-Path $(Join-Path $global:ScriptRoot 'config.json'))) {
    Write-Log -Message "Config File missing, downloading it for you..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    Invoke-WebRequest -uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/config.example.json" -OutFile "$global:ScriptRoot\config.json"
    Write-Log -Subtext "Config File downloaded here: '$global:ScriptRoot\config.json'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    Write-Log -Subtext "Please configure the config file according to GH, Exit script now..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    Exit
}

# Test Json if something is missing
CheckJson -jsonExampleUrl "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/config.example.json" -jsonFilePath $(Join-Path $global:ScriptRoot 'config.json')

# Check if Script is Latest
$LatestScriptVersion = Invoke-RestMethod -Uri "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Release.txt" -Method Get -ErrorAction Stop
if ($CurrentScriptVersion -eq $LatestScriptVersion) {
    Write-Log -Message "You are Running Latest Script Version - v$CurrentScriptVersion" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
}
Else {
    Write-Log -Message "You are Running Script in Version: v$CurrentScriptVersion - Latest Version is: v$LatestScriptVersion" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}

# load config file
$config = Get-Content -Raw -Path $(Join-Path $global:ScriptRoot 'config.json') | ConvertFrom-Json

# Access variables from the config file
# Notification Part
$global:SendNotification = $config.Notification.SendNotification

if ($global:OSType -eq 'DockerAlpine') {
    $Platform = 'Docker'
}
elseif ($global:OSType -eq 'Unix' -and $env:POWERSHELL_DISTRIBUTION_CHANNEL -notlike 'PSDocker-Alpine*') {
    $Platform = 'Linux'
}
elseif ($global:OSType -eq 'Win32NT') {
    $Platform = 'Windows'
}
Else {
    $Platform = 'Unknown'
}

if ($env:POWERSHELL_DISTRIBUTION_CHANNEL -like 'PSDocker-Alpine*') {
    $global:NotifyUrl = $config.Notification.AppriseUrl
    if ($global:NotifyUrl -eq 'discord://{WebhookID}/{WebhookToken}/' -and $global:SendNotification -eq 'True') {
        # Try the normal discord url
        $global:NotifyUrl = $config.Notification.Discord
        if ($global:NotifyUrl -eq 'https://discordapp.com/api/webhooks/{WebhookID}/{WebhookToken}' -and $global:SendNotification -eq 'True') {
            Write-Log -Message "Found default Notification Url, please update url in config..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
        Write-Log -Message "Found default Notification Url, please update url in config..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
        Pause
        Exit
    }
}

# Api Part
$global:tvdbapi = $config.ApiPart.tvdbapi
$global:tmdbtoken = $config.ApiPart.tmdbtoken
$FanartTvAPIKey = $config.ApiPart.FanartTvAPIKey
$PlexToken = $config.ApiPart.PlexToken
$global:FavProvider = $config.ApiPart.FavProvider.ToUpper()
$global:PreferedLanguageOrder = $config.ApiPart.PreferedLanguageOrder
# default Lang order if missing in config
if (!$global:PreferedLanguageOrder) {
    Write-Log -Message "Lang search Order not set in Config, setting it to 'xx,en,de' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    $global:PreferedLanguageOrder = "xx", "en", "de"
}
$global:PreferedLanguageOrderTMDB = $global:PreferedLanguageOrder.Replace('xx', 'null')
$global:PreferedLanguageOrderFanart = $global:PreferedLanguageOrder.Replace('xx', '00')
$global:PreferedLanguageOrderTVDB = $global:PreferedLanguageOrder.Replace('xx', 'null')
if ($global:PreferedLanguageOrder[0] -eq 'xx') {
    $global:PreferTextless = $true
}
Else {
    $global:PreferTextless = $false
}
# default to TMDB if favprovider missing
if (!$global:FavProvider) {
    Write-Log -Message "FavProvider not set in config, setting it to 'TMDB' for you" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
    $global:FavProvider = 'TMDB'
}

# Plex Part
$LibstoExclude = $config.PlexPart.LibstoExclude
$PlexUrl = $config.PlexPart.PlexUrl
# Prerequisites Part
# Rotate logs
$logFolder = Join-Path $global:ScriptRoot "Logs"
$folderPattern = "Logs_*"
$maxLogs = [int]$config.PrerequisitePart.maxLogs  # Cast to integer
$RotationFolderName = "RotatedLogs"
$RotationFolder = Join-Path $global:ScriptRoot $RotationFolderName
# Create Folder if missing
if (!(Test-Path -path $RotationFolder)) {
    New-Item -ItemType Directory -Path $global:ScriptRoot -Name $RotationFolderName -Force | Out-Null
}
# Check if the cast was successful
if ($null -eq $maxLogs) {
    Write-Warning "Invalid value for maxLogs. Setting it to 1."
    $maxLogs = 1
}
# Ensure $maxLogs is at least 1
if ($maxLogs -le 0) {
    Write-Warning "Invalid value for maxLogs. Setting it to 1."
    $maxLogs = 1
}

# Check if the log folder exists
if (Test-Path -Path $logFolder -PathType Container) {
    # Rename the existing log folder with a timestamp
    $timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    Rename-Item -Path $logFolder -NewName "Logs`_$timestamp"
    if (!(Test-Path $RotationFolder)) {
        New-Item -ItemType Directory -Path $global:ScriptRoot -Name $RotationFolderName -Force | Out-Null
    }
    Move-Item -Path "$logFolder`_$timestamp" $RotationFolder
}

# Delete excess log folders
$logFolders = Get-ChildItem -Path $(Join-Path $global:ScriptRoot $RotationFolderName) -Directory | Where-Object { $_.Name -match $folderPattern } | Sort-Object CreationTime -Descending | Select-Object -First $maxLogs
foreach ($folder in (Get-ChildItem -Path $(Join-Path $global:ScriptRoot $RotationFolderName) -Directory | Where-Object { $_.Name -match $folderPattern })) {
    if ($folder.FullName -notin $logFolders.FullName) {
        Remove-Item -Path $folder.FullName -Recurse -Force
    }
}

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
$Errorcount = 0

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
            Write-Log -Message 'Please change default asset Path...' -Path $configLogging -Type Error
            Exit
        }
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

# Delete all files and subfolders within the temp directory
if (Test-Path $TempPath) {
    Remove-Item -Path (Join-Path $TempPath '*') -Recurse -Force
}

if ($Testing) {
    if ((Test-Path $TestPath)) {
        Remove-Item -Path (Join-Path $TestPath '*') -Recurse -Force
    }
}

# Test and download files if they don't exist
function Test-And-Download {
    param(
        [string]$url,
        [string]$destination
    )

    if (!(Test-Path $destination)) {
        Invoke-WebRequest -Uri $url -OutFile $destination
    }
}

Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/overlay.png" -destination (Join-Path $TempPath 'overlay.png')
Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/backgroundoverlay.png" -destination (Join-Path $TempPath 'backgroundoverlay.png')
Test-And-Download -url "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/Rocky.ttf" -destination (Join-Path $TempPath 'Rocky.ttf')

# Cleanup old log files
if ($Testing) {
    $logFilesToDelete = @("Manuallog.log", "Testinglog.log", "ImageMagickCommands.log", "Scriptlog.log")
}
else {
    $logFilesToDelete = @("Manuallog.log", "Testinglog.log", "ImageMagickCommands.log", "Scriptlog.log", "ImageChoices.csv")
}

foreach ($logFile in $logFilesToDelete) {
    $logFilePath = Join-Path $LogsPath $logFile
    if (Test-Path $logFilePath) {
        Remove-Item $logFilePath
    }
}

# Write log message
$logMessage = "Old log files cleared..."
Write-Log -Message $logMessage -Path $configLogging -Type Warning

# Display Current Config settings:
Write-Log -Message "Current Config.json Settings" -Path $configLogging -Type Trace
Write-Log -Subtext "___________________________________________" -Path $configLogging -Type Debug
# Plex Part
Write-Log -Subtext "API Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| TVDB API Key:                 $($global:tvdbapi[0..7] -join '')****" -Path $configLogging -Type Info
Write-Log -Subtext "| TMDB API Token:               $($global:tmdbtoken[0..7] -join '')****" -Path $configLogging -Type Info
Write-Log -Subtext "| Fanart API Key:               $($FanartTvAPIKey[0..7] -join '')****" -Path $configLogging -Type Info
if ($PlexToken) {
    Write-Log -Subtext "| Plex Token:                   $($PlexToken[0..7] -join '')****" -Path $configLogging  -Type Info
}
Write-Log -Subtext "| Fav Provider:                 $global:FavProvider" -Path $configLogging  -Type Info
Write-Log -Subtext "| Prefered Lang Order:          $($global:PreferedLanguageOrder -join ',')" -Path $configLogging  -Type Info
Write-Log -Subtext "Plex Part" -Path $configLogging  -Type Trace
Write-Log -Subtext "| Excluded Libs:                $($LibstoExclude -join ',')" -Path $configLogging -Type Info
Write-Log -Subtext "| Plex Url:                     $($PlexUrl[0..10] -join '')****" -Path $configLogging -Type Info
Write-Log -Subtext "Prerequisites Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| Asset Path:                   $AssetPath" -Path $configLogging -Type Info
Write-Log -Subtext "| Script Root:                  $global:ScriptRoot" -Path $configLogging -Type Info
Write-Log -Subtext "| Magick Location:              $magickinstalllocation" -Path $configLogging -Type Info
Write-Log -Subtext "| Used Poster Font:             $font" -Path $configLogging -Type Info
Write-Log -Subtext "| Used Background Font:         $backgroundfont" -Path $configLogging -Type Info
Write-Log -Subtext "| Used TitleCard Font:          $titlecardfont" -Path $configLogging -Type Info
Write-Log -Subtext "| Used Poster Overlay File:     $Posteroverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Used Background Overlay File: $Backgroundoverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Used TitleCard Overlay File:  $titlecardoverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Create Library Folders:       $LibraryFolders" -Path $configLogging -Type Info
Write-Log -Subtext "| Create Season Posters:        $global:SeasonPosters" -Path $configLogging -Type Info
Write-Log -Subtext "| Create Background Posters:    $global:BackgroundPosters" -Path $configLogging -Type Info
Write-Log -Subtext "| Create Title Cards:           $global:TitleCards" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay General Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| Process Images:               $global:ImageProcessing" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay Poster Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| All Caps on Text:             $fontAllCaps" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Border to Image:          $AddBorder" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Text to Image:            $AddText" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Overlay to Image:         $AddOverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Font Color:                   $fontcolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Color:                 $bordercolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Min Font Size:                $minPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Max Font Size:                $maxPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Width:                 $borderwidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Width:               $MaxWidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Height:              $MaxHeight" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Offset:              $text_offset" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay Background Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| All Caps on Text:             $BackgroundfontAllCaps" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Border to Background:     $AddBackgroundBorder" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Text to Background:       $AddBackgroundText" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Overlay to Background:    $AddBackgroundOverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Font Color:                   $Backgroundfontcolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Color:                 $Backgroundbordercolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Min Font Size:                $BackgroundminPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Max Font Size:                $BackgroundmaxPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Width:                 $Backgroundborderwidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Width:               $BackgroundMaxWidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Height:              $BackgroundMaxHeight" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Offset:              $Backgroundtext_offset" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay TitleCard Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| Add Border to Background:     $AddTitleCardBorder" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Color:                 $TitleCardbordercolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Overlay to Background:    $AddTitleCardOverlay" -Path $configLogging -Type Info
Write-Log -Subtext "| Border Width:                 $TitleCardborderwidth" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay TitleCard Title Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| All Caps on Text:             $TitleCardEPTitlefontAllCaps" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Title to TitleCard:       $AddTitleCardEPTitleText" -Path $configLogging -Type Info
Write-Log -Subtext "| Font Color:                   $TitleCardEPTitlefontcolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Min Font Size:                $TitleCardEPTitleminPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Max Font Size:                $TitleCardEPTitlemaxPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Width:               $TitleCardEPTitleMaxWidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Height:              $TitleCardEPTitleMaxHeight" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Offset:              $TitleCardEPTitletext_offset" -Path $configLogging -Type Info
Write-Log -Subtext "OverLay TitleCard EP Part" -Path $configLogging -Type Trace
Write-Log -Subtext "| All Caps on Text:             $TitleCardEPfontAllCaps" -Path $configLogging -Type Info
Write-Log -Subtext "| Add Episode to TitleCard:     $AddTitleCardEPText" -Path $configLogging -Type Info
Write-Log -Subtext "| Font Color:                   $TitleCardEPfontcolor" -Path $configLogging -Type Info
Write-Log -Subtext "| Min Font Size:                $TitleCardEPminPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Max Font Size:                $TitleCardEPmaxPointSize" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Width:               $TitleCardEPMaxWidth" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Height:              $TitleCardEPMaxHeight" -Path $configLogging -Type Info
Write-Log -Subtext "| Text Box Offset:              $TitleCardEPtext_offset" -Path $configLogging -Type Info
Write-Log -Subtext "___________________________________________" -Path $configLogging -Type Debug
Write-Log -Message "Starting main Script now..." -Path $configLogging -Type Success    

# Get files in script root with specified extensions
$files = Get-ChildItem -Path $global:ScriptRoot -File | Where-Object { $_.Extension -in $fileExtensions } -ErrorAction SilentlyContinue

# Copy files to the destination directory
foreach ($file in $files) {
    $destinationPath = Join-Path -Path (Join-Path -Path $global:ScriptRoot -ChildPath 'temp') -ChildPath $file.Name
    if (!(Test-Path -LiteralPath $destinationPath)) {
        Copy-Item -Path $file.FullName -Destination $destinationPath -Force | Out-Null
        Write-Log -Subtext "Found File: '$($file.Name)' in ScriptRoot - copy it into temp folder..." -Path $configLogging -Type Trace
    }
}

# Call the function with your variables
CheckJsonPaths -font $font -backgroundfont $backgroundfont -titlecardfont $titlecardfont -Posteroverlay $Posteroverlay -Backgroundoverlay $Backgroundoverlay -titlecardoverlay $titlecardoverlay

# Check Plex now:
if ($PlexToken) {
    Write-Log -Message "Plex token found, checking access now..." -Path $configLogging -Type Info
    if ((Invoke-WebRequest "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken").StatusCode -eq 200) {
        Write-Log -Subtext "Plex access is working..." -Path $configLogging -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections/?X-Plex-Token=$PlexToken").content
    }
    Else {
        Write-Log -Message "Could not access plex with this url: $PlexUrl/library/sections/?X-Plex-Token=$PlexToken" -Path $configLogging -Type Error
        Write-Log -Subtext "Please check token and access..." -Path $configLogging -Type Error
        $Errorcount++
        Exit
    }
}
Else {
    Write-Log -Message "Checking Plex access now..." -Path $configLogging -Type Info
    try {
        $result = Invoke-WebRequest -Uri "$PlexUrl/library/sections" -ErrorAction SilentlyContinue
    }
    catch {
        Write-Log -Message "Could not access plex with this url: $PlexUrl/library/sections" -Path $configLogging -Type Error
        Write-Log -Message "Error Message: $_" -Path $configLogging -Type Error
        $Errorcount++
        Write-Log -Subtext "Please check access and settings in plex..." -Path $configLogging -Type Warning
        Write-Log -Message "To be able to connect to plex without Auth" -Path $configLogging -Type Info
        Write-Log -Message "You have to enter your ip range in 'Settings -> Network -> List of IP addresses and networks that are allowed without auth: '192.168.1.0/255.255.255.0''" -Path $configLogging -Type Info
        Exit
    }
    if ($result.StatusCode -eq 200) {
        Write-Log -Subtext "Plex access is working..." -Path $configLogging -Type Success
        [xml]$Libs = (Invoke-WebRequest "$PlexUrl/library/sections").content
    }
}

if (!(Test-Path $magick)) {
    if ($global:OSType -ne "Win32NT") {
        if ($global:OSType -ne "DockerAlpine") {
            Write-Log -Message "ImageMagick missing, downloading the portable version for you..." -Path $configLogging -Type Warning
            Invoke-WebRequest -Uri "https://imagemagick.org/archive/binaries/magick" -OutFile "$global:ScriptRoot/magick"
            chmod +x "$global:ScriptRoot/magick"
            Write-Log -Subtext "made the portable magick executeable..." -Path $configLogging -Type Success
        }
    }
    Else {
        Write-Log -Message "ImageMagick missing, downloading it for you..." -Path $configLogging -Type Error
        $Errorcount++
        $result = Invoke-WebRequest "https://imagemagick.org/archive/binaries/?C=M;O=D"
        $LatestRelease = ($result.links.href | Where-Object { $_ -like '*portable-Q16-HDRI-x64.zip' } | Sort-Object -Descending)[0]
        # Construct the download path
        $DownloadPath = Join-Path -Path $global:ScriptRoot -ChildPath (Join-Path -Path 'temp' -ChildPath $LatestRelease)
        Invoke-WebRequest "https://imagemagick.org/archive/binaries/$LatestRelease" -OutFile $DownloadPath
        # Construct the portable path
        Expand-Archive -Path $DownloadPath -DestinationPath $magickinstalllocation -Force
        if ((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name -eq $($LatestRelease.replace('.zip', ''))) {
            Copy-item -Force -Recurse "$magickinstalllocation\$((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name)\*" $magickinstalllocation
            Remove-Item -Recurse -LiteralPath "$magickinstalllocation\$((Get-ChildItem -Directory -LiteralPath $magickinstalllocation).name)" -Force
        }
        if (Test-Path -LiteralPath $magickinstalllocation\magick.exe) {
            Write-Log -Subtext "Placed Portable ImageMagick here: $magickinstalllocation" -Path $configLogging -Type Success
        }
        Else {
            Write-Log -Subtext "Error During extraction, please manually install/copy portable Imagemagick from here: https://imagemagick.org/archive/binaries/$LatestRelease" -Path $configLogging -Type Error
        }
    }
}

$Posteroverlaydimensions = & $magick $Posteroverlay -format "%wx%h" info:
$Backgroundoverlaydimensions = & $magick $Backgroundoverlay -format "%wx%h" info:
$titlecardoverlaydimensions = & $magick $titlecardoverlay -format "%wx%h" info:

# Check Poster Overlay Size:
if ($Posteroverlaydimensions -eq $PosterSize) {
    Write-Log -Message "Poster overlay is correctly sized at: $Postersize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
}
else {
    Write-Log -Message "Poster overlay is NOT correctly sized at: $Postersize. Actual dimensions: $Posteroverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}
# Check Background Overlay Size:
if ($Backgroundoverlaydimensions -eq $BackgroundSize) {
    Write-Log -Message "Background overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
}
else {
    Write-Log -Message "Background overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $Backgroundoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}
# Check TitleCard Overlay Size:
if ($titlecardoverlaydimensions -eq $BackgroundSize) {
    Write-Log -Message "TitleCard overlay is correctly sized at: $BackgroundSize" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
}
else {
    Write-Log -Message "TitleCard overlay is NOT correctly sized at: $BackgroundSize. Actual dimensions: $titlecardoverlaydimensions" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
}

# check if fanart Module is installed
if (!(Get-InstalledModule -Name FanartTvAPI)) {
    Write-Log -Message "FanartTvAPI Module missing, installing it for you..." -Path $configLogging -Type Error
    $Errorcount++
    Install-Module -Name FanartTvAPI -Force -Confirm -AllowClobber
    
    Write-Log -Subtext "FanartTvAPI Module installed, importing it now..." -Path $configLogging -Type Success
    Import-Module -Name FanartTvAPI
}
# Add Fanart Api
Add-FanartTvAPIKey -Api_Key $FanartTvAPIKey

# Check TMDB Token before building the Header.
if ($global:tmdbtoken.Length -le '35') {
    Write-Log -Message "TMDB Token is to short, you may have used Api key in config file, please change it to 'API Read Access Token'." -Path $configLogging -Type Error
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

if ($Manual) {
    Write-Log -Message "Manual Poster Creation Started" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Debug
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
        Write-Log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info

        # Resize Image to 2000x3000 and apply Border and overlay
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
            Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
            Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
            Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
            Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        }

        $logEntry = "`"$magick`" $Arguments"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments

        if ($AddText -eq 'true') {
            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
            Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
            Write-Log -Subtext "    Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
            $logEntry = "`"$magick`" $Arguments"
            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        }
    }
    Else {
        # Resize Image to 2000x3000
        $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
        Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Manuallog.log -Type Info
        $logEntry = "`"$magick`" $Resizeargument"
        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
    }
    # Move file back to original naming with Brackets.
    Move-Item -LiteralPath $PosterImage -destination $PosterImageoriginal -Force -ErrorAction SilentlyContinue
    Write-Log -Subtext "Poster created and moved to: $PosterImageoriginal" -Path $global:ScriptRoot\Logs\Manuallog.log -Type Success
}
Elseif ($Testing) {
    Write-Log -Message "Poster Testing Started" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Debug
    Write-Log -Subtext "I will now create a few posters for you with different text lengths using your current configuration settings." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Warning
    # Poster Part
    if (!(Test-Path $testimage)) {
        $ArgumentCreate = "-size `"$PosterSize`" xc:pink -background none `"$testimage`""
        $logEntryCreate = "`"$magick`" $ArgumentCreate"
        $logEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentCreate
        Write-Log -Subtext "Test Poster Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
    }
    if (!(Test-Path $backgroundtestimage)) {
        $backgroundArgumentCreate = "-size `"$BackgroundSize`" xc:pink -background none `"$backgroundtestimage`""
        $backgroundlogEntryCreate = "`"$magick`" $backgroundArgumentCreate"
        $backgroundlogEntryCreate | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentCreate
        Write-Log -Subtext "Test Background/TitleCard Created..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
    }
    $ShortText = "The Hobbit" 
    $MediumText = "The Hobbit is a great movie" 
    $LongText = "The Hobbit is a great movie that we all loved and enjoyed watching" 
    $bullet = [char]0x2022
    $Episodetext = "Season 9999 $bullet Episode 9999"

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
        Write-Log -Subtext "Calculating Optimal Font Sizes. This may take a while..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
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
        Write-Log -Subtext "Finished Optimal Font Sizes for posters..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
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
        Write-Log -Subtext "Finished Optimal Font Sizes for backgrounds..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
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
        $TitleCardoptimalFontSizeEpisodetext = Get-OptimalPointSize -text $Episodetext -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize    
        if ($global:IsTruncated) { $TruncatedCount++ }
        $TitleCardoptimalFontSizeEpisodetextCAPS = Get-OptimalPointSize -text $EpisodetextCAPS -font $titlecardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize    
        if ($global:IsTruncated) { $TruncatedCount++ }
    }
    if ($AddText -eq 'true' -or $AddBackgroundText -eq 'True' -or $AddTitleCardEPTitleText -eq 'True' -or $AddTitleCardEPText -eq 'True') {
        Write-Log -Subtext "Finished Optimal Font Sizes for titlecards..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Trace
    }
    
    # Border/Overlay Poster Part
    
    Write-Log -Subtext "Poster Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    if ($AddText -eq 'true') {
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
            Write-Log -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $ArgumentsShort = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterLongCAPS`""
            Write-Log -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $ArgumentsShort = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterLongCAPS`""
            Write-Log -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $ArgumentsShort = "`"$testimage`" -quality $global:outputQuality `"$TestPosterShort`""
            $ArgumentsMedium = "`"$testimage`" -quality $global:outputQuality `"$TestPosterMedium`""
            $ArgumentsLong = "`"$testimage`" -quality $global:outputQuality `"$TestPosterLong`""
            $ArgumentsShortCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterShortCAPS`""
            $ArgumentsMediumCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterMediumCAPS`""
            $ArgumentsLongCAPS = "`"$testimage`" -quality $global:outputQuality `"$TestPosterLongCAPS`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLongCAPS
    }
    Else {
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
            $ArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterTextless`""
            Write-Log -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
            $ArgumentsTextless = "`"$testimage`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$TestPosterTextless`""
            Write-Log -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
            $ArgumentsTextless = "`"$testimage`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$TestPosterTextless`""
            Write-Log -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
            $ArgumentsTextless = "`"$testimage`" -quality $global:outputQuality `"$TestPosterTextless`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        $PosterlogEntryTextless = "`"$magick`" $ArgumentsTextless"
        $PosterlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsTextless
    }
    # Text Poster overlay
    if ($AddText -eq 'true') {
        # Logging Poster
        Write-Log -Subtext "Optimal font size for Short text is: '$optimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium text is: '$optimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long text is: '$optimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        
        Write-Log -Subtext "Optimal font size for Short CAPS text is: '$optimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium CAPS text is: '$optimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long CAPS text is: '$optimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    
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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsLongCAPS
    }
    Else {
        Write-Log -Subtext "    Applying textbox only to Poster..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        $ArgumentsNoText = "`"$TestPosterTextless`" -size `"$boxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$text_offset`" -compose over -composite `"$TestPosterTextless`""
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $ArgumentsNoText
    }

    Write-Log -Subtext "Background Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    # Border/Overlay Background Part
    if ($AddBackgroundText -eq 'true') {
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundTestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundTestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
            $backgroundArgumentsShort = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterShort`""
            $backgroundArgumentsMedium = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterMedium`""
            $backgroundArgumentsLong = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterLong`""
            $backgroundArgumentsShortCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterShortCAPS`""
            $backgroundArgumentsMediumCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterMediumCAPS`""
            $backgroundArgumentsLongCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$backgroundTestPosterLongCAPS`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLongCAPS
    }
    Else {
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$BackgroundTestPosterTextless`""
            Write-Log -Subtext "Adding Poster Borders | Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$BackgroundTestPosterTextless`""
            Write-Log -Subtext "Adding Poster Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$BackgroundTestPosterTextless`""
            Write-Log -Subtext "Adding Poster Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
            $BackgroundArgumentsTextless = "`"$backgroundtestimage`" -quality $global:outputQuality `"$BackgroundTestPosterTextless`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        $BackgroundlogEntryTextless = "`"$magick`" $BackgroundArgumentsTextless"
        $BackgroundlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $BackgroundArgumentsTextless
    }
    # Text background overlay
    if ($AddBackgroundText -eq 'True') {
        # Logging Background
        Write-Log -Subtext "Optimal font size for Short text is: '$backgroundoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium text is: '$backgroundoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long text is: '$backgroundoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
    
        Write-Log -Subtext "Optimal font size for Short CAPS text is: '$backgroundoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium CAPS text is: '$backgroundoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long CAPS text is: '$backgroundoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        
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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $backgroundArgumentsLongCAPS
    }
    Else {
        Write-Log -Subtext "    Applying textbox only to Background..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        $BackgroundArgumentsNoText = "`"$BackgroundTestPosterTextless`" -size `"$Backgroundboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$Backgroundtext_offset`" -compose over -composite `"$BackgroundTestPosterTextless`""
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $BackgroundArgumentsNoText
    }
    Write-Log -Subtext "TitleCard Part:" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    # Border/Overlay TitleCard Part
    if ($AddTitleCardEPTitleText -eq 'true' -or $AddTitleCardEPText -eq 'True') {
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'true') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Borders | Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'false') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$titlecardtestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'true') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$titlecardtestPosterLongCAPS`""
            Write-Log -Subtext "Adding Background Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'false') {
            $titlecardArgumentsShort = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterShort`""
            $titlecardArgumentsMedium = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterMedium`""
            $titlecardArgumentsLong = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterLong`""
            $titlecardArgumentsShortCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterShortCAPS`""
            $titlecardArgumentsMediumCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterMediumCAPS`""
            $titlecardArgumentsLongCAPS = "`"$backgroundtestimage`" -quality $global:outputQuality `"$titlecardtestPosterLongCAPS`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $titlecardArgumentsLongCAPS
    }
    Else {
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'true') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$TitleCardTestPosterTextless`""
            Write-Log -Subtext "Adding TitleCard Borders | Adding TitleCard Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'true' -and $Addtitlecardoverlay -eq 'false') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" -shave `"$titlecardborderwidthsecond`"  -bordercolor `"$titlecardbordercolor`" -border `"$titlecardborderwidth`" `"$TitleCardTestPosterTextless`""
            Write-Log -Subtext "Adding TitleCard Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'true') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" `"$titlecardoverlay`" -gravity south -quality $global:outputQuality -composite `"$TitleCardTestPosterTextless`""
            Write-Log -Subtext "Adding TitleCard Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        if ($Addtitlecardborder -eq 'false' -and $Addtitlecardoverlay -eq 'false') {
            $TitleCardArgumentsTextless = "`"$backgroundtestimage`" -quality $global:outputQuality `"$TitleCardTestPosterTextless`""
            Write-Log -Subtext "Nothing specified, just output pic with desired quality" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        }
        $titlecardlogEntryTextless = "`"$magick`" $TitleCardArgumentsTextless"
        $titlecardlogEntryTextless | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardArgumentsTextless
    }

    # Text TitleCard Title overlay
    if ($AddTitleCardEPTitleText -eq 'True') {
        # Logging TitleCards
        Write-Log -Subtext "Optimal font size for Short text is: '$titlecardoptimalFontSizeShort'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$ShortText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium text is: '$titlecardoptimalFontSizeMedium'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$MediumText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long text is: '$titlecardoptimalFontSizeLong'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$LongText`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Short CAPS text is: '$titlecardoptimalFontSizeShortCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$ShortTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Medium CAPS text is: '$titlecardoptimalFontSizeMediumCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$MediumTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Long CAPS text is: '$titlecardoptimalFontSizeLongCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$LongTextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsLongCAPS
    }
    Elseif ($AddTitleCardEPTitleText -eq 'false' -and $AddTitleCardEPText -eq 'True') {
        Write-Log -Subtext "    Applying Title textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
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

        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPTitleArgumentsNoTextLongCAPS
    }
    Else {
        Write-Log -Subtext "    Applying Title textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        $TitleCardTitleArgumentsNoText = "`"$TitleCardTestPosterTextless`" -size `"$TitleCardEPTitleboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPTitletext_offset`" -compose over -composite `"$TitleCardTestPosterTextless`""

        # Episode Text Titlecard Logging
        $TitleCardEPTitlelogEntryNoText = "`"$magick`" $TitleCardTitleArgumentsNoText"
        $TitleCardEPTitlelogEntryNoText | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardTitleArgumentsNoText
    }
    # Text TitleCard EP overlay
    if ($AddTitleCardEPText -eq 'True') {
        Write-Log -Subtext "Optimal font size for Episode CAPS text is: '$TitleCardoptimalFontSizeEpisodetextCAPS'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying CAPS text: `"$EpisodetextCAPS`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "Optimal font size for Episode text is: '$TitleCardoptimalFontSizeEpisodetext'" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        Write-Log -Subtext "    Applying text: `"$Episodetext`"" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info

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
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsLongCAPS
    }
    Elseif ($AddTitleCardEPText -eq 'false' -and $AddTitleCardEPTitleText -eq 'True') {
        Write-Log -Subtext "    Applying EP textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
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

        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextShort
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextMedium
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextLong
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextShortCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextMediumCAPS
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoTextLongCAPS
    }
    Else {
        Write-Log -Subtext "    Applying EP textbox only to TitleCard..." -Path $global:ScriptRoot\Logs\Testinglog.log -Type Info
        $TitleCardEPArgumentsNoText = "`"$TitleCardTestPosterTextless`" -size `"$TitleCardEPboxsize`" xc:`"#ACD7E6`" -gravity south -geometry +0+`"$TitleCardEPtext_offset`" -compose over -composite `"$TitleCardTestPosterTextless`""
        
        # Episode Text Titlecard Logging
        $TitleCardEPlogEntryNoText = "`"$magick`" $TitleCardEPArgumentsNoText"
        $TitleCardEPlogEntryNoText | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
        Start-Process $magick -Wait -NoNewWindow -ArgumentList $TitleCardEPArgumentsNoText
    }


    $endTime = Get-Date
    $executionTime = New-TimeSpan -Start $startTime -End $endTime
    # Format the execution time
    $hours = [math]::Floor($executionTime.TotalHours)
    $minutes = $executionTime.Minutes
    $seconds = $executionTime.Seconds
    $FormattedTimespawn = $hours.ToString() + "h " + $minutes.ToString() + "m " + $seconds.ToString() + "s "
    Write-Log -Subtext "Poster/Background/TitleCard Tests finished, you can find them here: $(Join-Path $global:ScriptRoot 'test')" -Path (Join-Path $global:ScriptRoot 'Logs\Testinglog.log') -Type Success
    Write-Log -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Testinglog.log -Type Success
    Remove-Item -LiteralPath $testimage | out-null
    Remove-Item -LiteralPath $backgroundtestimage | out-null
    $gettestimages = Get-ChildItem $global:ScriptRoot\test
    $titlecardscount = ($gettestimages | Where-Object { $_.name -like 'Title*' }).count
    $backgroundsscount = ($gettestimages | Where-Object { $_.name -like 'back*' }).count
    $posterscount = ($gettestimages | Where-Object { $_.name -like 'poster*' }).count
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
                "color": $(if ($Errorcount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
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
                    "color": $(if ($Errorcount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
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
    Write-Log -Message "Query plex libs..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
    Write-Log -Subtext "Found '$($Libsoverview.count)' libs and '$($LibstoExclude.count)' are excluded..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $IncludedLibraryNames = $Libsoverview.Name -join ', '
    Write-Log -Subtext "Included Libraries: $IncludedLibraryNames" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    Write-Log -Message "Query all items from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                    $SeasonsTemp = $Seasondata.MediaContainer.Directory | Where-Object { $_.Title -ne 'All episodes' }
                    $SeasonNames = $SeasonsTemp.Title -join ','
                    $SeasonNumbers = $SeasonsTemp.index -join ','
                    $SeasonRatingkeys = $SeasonsTemp.ratingKey -join ','
                    $SeasonPosterUrl = ($SeasonsTemp | where { $_.type -eq "season" }).thumb -join ','
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
            }
        }
    }
    Write-Log -Subtext "Found '$($Libraries.count)' Items..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    $Libraries | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexLibexport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
    Write-Log -Message "Export everything to a csv: $global:ScriptRoot\Logs\PlexLibexport.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info

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
        Write-Log -Message "Query episodes data from all Libs, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        # Query episode info
        $Episodedata = @()
        foreach ($showentry in $AllShows) {
            # Getting child entries for each season
            $splittedkeys = $showentry.SeasonRatingKeys.split(',')
            foreach ($key in $splittedkeys) {
                if ($PlexToken) {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children?X-Plex-Token=$PlexToken).content
                    }
                }
                Else {
                    if ($contentquery -eq 'Directory') {
                        [xml]$Seasondata = (Invoke-WebRequest $PlexUrl/library/metadata/$key/children?).content
                    }
                }
                $tempseasondata = New-Object psobject
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Show Name" -Value $Seasondata.MediaContainer.grandparentTitle
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Type" -Value $Seasondata.MediaContainer.viewGroup
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tvdbid" -Value $showentry.tvdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "tmdbid" -Value $showentry.tmdbid
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Season Number" -Value $Seasondata.MediaContainer.parentIndex
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Episodes" -Value $($Seasondata.MediaContainer.video.index -join ',')
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Seasondata.MediaContainer.video.title -join ';')
                $tempseasondata | Add-Member -MemberType NoteProperty -Name "PlexTitleCardUrls" -Value $($Seasondata.MediaContainer.video.thumb -join ',')
                $Episodedata += $tempseasondata
            }
        }
        $Episodedata | Select-Object * | Export-Csv -Path "$global:ScriptRoot\Logs\PlexEpisodeExport.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force
        Write-Log -Subtext "Found '$($Episodedata.Episodes.split(',').count)' Episodes..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
    }
    # Query episode info
    # Download poster foreach movie
    Write-Log -Message "Starting poster creation now, this can take a while..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    Write-Log -Message "Starting Movie Poster Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    # Movie Part
    foreach ($entry in $AllMovies) {
        try {
            if ($($entry.RootFoldername)) {
                $global:posterurl = $null
                $global:TextlessPoster = $null
                $global:TMDBfallbackposterurl = $null
                $global:fanartfallbackposterurl = $null
                $global:IsFallback = $null
    
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
    
                $PosterImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername).jpg"
                $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
    
                if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:posterurl = $null
                    $global:PosterWithText = $null
                    $global:Fallback = $null
                    if ($PlexToken) {
                        $Arturl = $plexurl + $entry.PlexPosterUrl + "?X-Plex-Token=$PlexToken"
                    }
                    Else {
                        $Arturl = $plexurl + $entry.PlexPosterUrl
                    }
                    Write-Log -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMoviePoster } }
                        'FANART' { $global:posterurl = GetFanartMoviePoster }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMoviePoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMoviePoster } }
                        'PLEX' { GetPlexArtwork -Type ' a Movie Poster' -ArtUrl $Arturl -TempImage $PosterImage }
                        Default { $global:posterurl = GetFanartMoviePoster }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMoviePoster } }
                        'FANART' { $global:posterurl = GetFanartMoviePoster }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-Log -Subtext "Took Fanart.tv Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-Log -Subtext "Took TMDB Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                    }
                    if (!$global:posterurl) {
                        $global:posterurl = GetTVDBMoviePoster
                        $global:IsFallback = $true
                        if (!$global:posterurl) {
                            GetPlexArtwork -Type ' a Movie Poster' -ArtUrl $Arturl -TempImage $PosterImage
                            $global:IsFallback = $true
                        }
                        if (!$global:posterurl -and $global:imdbid) { 
                            Write-Log -Subtext "Searching on IMDB for a movie poster" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:posterurl = GetIMDBPoster
                            $global:IsFallback = $true
                            if (!$global:posterurl) { 
                                Write-Log -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
                        if (!$global:PlexartworkDownloaded) {
                            Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage
                        }
                        Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        elseif ($global:posterurl -like "$PlexUrl*") {
                            Write-Log -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-Log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        
                            # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                                Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
                                Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                                Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            $logEntry = "`"$magick`" $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        
                            if ($AddText -eq 'true') {
                                $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
                                Write-Log -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "`"$magick`" $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                            }
                        }
                        Else {
                            $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                            Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "`"$magick`" $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                        }
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info

                        $movietemp = New-Object psobject
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie'
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                        $movietemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                        $movietemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                        # Export the array to a CSV file
                        $movietemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        $posterCount++
                    }
                    Else {
                        Write-Log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $Errorcount++
                    }
                }
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
        
                    $backgroundImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_background.jpg"
                    $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                    if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                        # Define Global Variables
                        $global:tmdbid = $entry.tmdbid
                        $global:tvdbid = $entry.tvdbid
                        $global:imdbid = $entry.imdbid
                        $global:posterurl = $null
                        $global:PosterWithText = $null
                        if ($PlexToken) {
                            $Arturl = $plexurl + $entry.PlexBackgroundUrl + "?X-Plex-Token=$PlexToken"
                        }
                        Else {
                            $Arturl = $plexurl + $entry.PlexBackgroundUrl
                        }
                        Write-Log -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        switch -Wildcard ($global:FavProvider) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                            'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBMovieBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartMovieBackground } }
                            'PLEX' { GetPlexArtwork -Type ' a Movie Background' -ArtUrl $Arturl -TempImage $backgroundImage }
                            Default { $global:posterurl = GetFanartMovieBackground }
                        }
                        switch -Wildcard ($global:Fallback) {
                            'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBMovieBackground } }
                            'FANART' { $global:posterurl = GetFanartMovieBackground }
                        }
                        if ($global:PreferTextless -eq 'True') {
                            if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                                $global:posterurl = $global:fanartfallbackposterurl
                                Write-Log -Subtext "Took Fanart.tv Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                                $global:IsFallback = $true
                            }
                            if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                                $global:posterurl = $global:TMDBfallbackposterurl
                                Write-Log -Subtext "Took TMDB Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                                $global:IsFallback = $true
                            }
                        }
                        if (!$global:posterurl) {
                            $global:posterurl = GetTVDBMovieBackground
                            if ($global:posterurl) { 
                                $global:IsFallback = $true
                            }
                            else { 
                                Write-Log -Subtext "Could not find a background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                            }
                        }
        
                        if ($BackgroundfontAllCaps -eq 'true') {
                            $joinedTitle = $Titletext.ToUpper()
                        }
                        Else {
                            $joinedTitle = $Titletext
                        }
                        if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                            if (!$global:PlexartworkDownloaded) {
                                Invoke-WebRequest -Uri $global:posterurl -OutFile $backgroundImage
                            }
                            Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            if ($global:posterurl -like 'https://image.tmdb.org*') {
                                if ($global:PosterWithText) {
                                    Write-Log -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                            }
                            elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                if ($global:PosterWithText) {
                                    Write-Log -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                }
                            }
                            elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                Write-Log -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            elseif ($global:posterurl -like "$PlexUrl*") {
                                Write-Log -Subtext "Downloading Background from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            if ($global:ImageProcessing -eq 'true') {
                                Write-Log -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
            
                                # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                    Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundImage`""
                                    Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                    $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                    Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                }
                                $logEntry = "`"$magick`" $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
            
                                if ($AddBackgroundText -eq 'true') {
                                    $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                    Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundImage`""
                                    Write-Log -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $logEntry = "`"$magick`" $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                }
                            }
                            Else {
                                $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "`"$magick`" $Resizeargument"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                            }
                            # Move file back to original naming with Brackets.
                            Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                            Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
    
                            $moviebackgroundtemp = New-Object psobject
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Movie Background'
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                            $moviebackgroundtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
            
                            # Export the array to a CSV file
                            $moviebackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                            $posterCount++
                            $BackgroundCount++
                        }
                        Else {
                            Write-Log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                            Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                            $Errorcount++
                        }
                    }
                }
            }
            
            Else {
                Write-Log -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                $Errorcount++
            }
        }
        catch {
            <#Do this if a terminating exception happens#>
        }
    }

    Write-Log -Message "Starting Show/Season Poster/Background/TitleCard Creation part..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    # Show Part
    foreach ($entry in $AllShows) {
        if ($($entry.RootFoldername)) {
            # Define Global Variables
            $global:tmdbid = $entry.tmdbid
            $global:tvdbid = $entry.tvdbid
            $global:imdbid = $entry.imdbid
            $Seasonpostersearchtext = $null
            $Episodepostersearchtext = $null
            $global:TMDBfallbackposterurl = $null
            $global:fanartfallbackposterurl = $null
            $FanartSearched = $null
            $global:posterurl = $null
            $global:PosterWithText = $null
            $global:IsFallback = $null
            $global:Fallback = $null
            $global:TextlessPoster = $null
            $global:tvdbalreadysearched = $null
    
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
    
            $PosterImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername).jpg"
            $PosterImage = $PosterImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
            if ($PlexToken) {
                $Arturl = $plexurl + $entry.PlexPosterUrl + "?X-Plex-Token=$PlexToken"
            }
            Else {
                $Arturl = $plexurl + $entry.PlexPosterUrl
            }
            if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                Write-Log -Message "Start Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                switch -Wildcard ($global:FavProvider) {
                    'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowPoster } }
                    'FANART' { $global:posterurl = GetFanartShowPoster }
                    'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowPoster }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowPoster } }
                    'PLEX' { GetPlexArtwork -Type ' a Show Poster' -ArtUrl $Arturl -TempImage $PosterImage }
                    Default { $global:posterurl = GetFanartShowPoster }
                }
                switch -Wildcard ($global:Fallback) {
                    'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowPoster } }
                    'FANART' { $global:posterurl = GetFanartShowPoster }
                }
                if ($global:PreferTextless -eq 'True') {
                    if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                        $global:posterurl = $global:fanartfallbackposterurl
                        Write-Log -Subtext "Took Fanart.tv Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                        $global:IsFallback = $true
                    }
                    if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                        $global:posterurl = $global:TMDBfallbackposterurl
                        Write-Log -Subtext "Took TMDB Fallback poster cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
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
                        Write-Log -Subtext "Could not find a poster on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
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
                    if (!$global:PlexartworkDownloaded) {
                        Invoke-WebRequest -Uri $global:posterurl -OutFile $PosterImage
                    }
                    Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    if ($global:posterurl -like 'https://image.tmdb.org*') {
                        if ($global:PosterWithText) {
                            Write-Log -Subtext "Downloading Poster with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Textless Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                    }
                    elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                        if ($global:PosterWithText) {
                            Write-Log -Subtext "Downloading Poster with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading Textless Poster from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                    }
                    elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                        Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                    }
                    elseif ($global:posterurl -like "$PlexUrl*") {
                        Write-Log -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                    }
                    Else {
                        Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        $global:IsFallback = $true
                    }
                    if ($global:ImageProcessing -eq 'true') {
                        Write-Log -Subtext "Processing Poster for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    
                        # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                            Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$PosterImage`""
                            Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$PosterImage`""
                            Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                            $Arguments = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                            Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        }
                        $logEntry = "`"$magick`" $Arguments"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
    
                        if ($AddText -eq 'true') {
                            $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                            Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $Arguments = "`"$PosterImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$PosterImage`""
                            Write-Log -Subtext "Applying Poster text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "`"$magick`" $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                        }
                    }
                    Else {
                        $Resizeargument = "`"$PosterImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$PosterImage`""
                        Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        $logEntry = "`"$magick`" $Resizeargument"
                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                    }
                    if (Get-ChildItem -LiteralPath $PosterImage -ErrorAction SilentlyContinue) {
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $PosterImage $PosterImageoriginal -Force -ErrorAction SilentlyContinue
                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $posterCount++
                    }

                    $showtemp = New-Object psobject
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show'
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                    $showtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                    $showtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                    $showtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
    
                    # Export the array to a CSV file
                    $showtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                }
                Else {
                    Write-Log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                    Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                    $Errorcount++
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
    
                $backgroundImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_background.jpg"
                $backgroundImage = $backgroundImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')

                if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                    # Define Global Variables
                    $global:tmdbid = $entry.tmdbid
                    $global:tvdbid = $entry.tvdbid
                    $global:imdbid = $entry.imdbid
                    $global:posterurl = $null
                    $global:PosterWithText = $null

                    if ($PlexToken) {
                        $Arturl = $plexurl + $entry.PlexBackgroundUrl + "?X-Plex-Token=$PlexToken"
                    }
                    Else {
                        $Arturl = $plexurl + $entry.PlexBackgroundUrl
                    }

                    Write-Log -Message "Start Background Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                    switch -Wildcard ($global:FavProvider) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                        'TVDB' { if ($entry.tvdbid) { $global:posterurl = GetTVDBShowBackground }Else { Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning; $global:posterurl = GetFanartShowBackground } }
                        'PLEX' { GetPlexArtwork -Type ' a Show Background' -ArtUrl $Arturl -TempImage $backgroundImage }
                        Default { $global:posterurl = GetFanartShowBackground }
                    }
                    switch -Wildcard ($global:Fallback) {
                        'TMDB' { if ($entry.tmdbid) { $global:posterurl = GetTMDBShowBackground } }
                        'FANART' { $global:posterurl = GetFanartShowBackground }
                    }
                    if ($global:PreferTextless -eq 'True') {
                        if (!$global:TextlessPoster -and $global:fanartfallbackposterurl) {
                            $global:posterurl = $global:fanartfallbackposterurl
                            Write-Log -Subtext "Took Fanart.tv Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                        if (!$global:TextlessPoster -and $global:TMDBfallbackposterurl) {
                            $global:posterurl = $global:TMDBfallbackposterurl
                            Write-Log -Subtext "Took TMDB Fallback background cause its your Fav Provider" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Trace
                            $global:IsFallback = $true
                        }
                    }
                    if ($global:TextlessPoster -eq 'true' -and $global:posterurl) {
                    } 
                    if (!$global:posterurl) {
                        $global:posterurl = GetTVDBShowBackground
                        $global:IsFallback = $true
                        
                        if (!$global:posterurl) { 
                            Write-Log -Subtext "Could not find a background on any site" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                        }
                        
                    }
    
                    if ($BackgroundfontAllCaps -eq 'true') {
                        $joinedTitle = $Titletext.ToUpper()
                    }
                    Else {
                        $joinedTitle = $Titletext
                    }
                    if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                        if (!$global:PlexartworkDownloaded) {
                            Invoke-WebRequest -Uri $global:posterurl -OutFile $backgroundImage
                        }
                        Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading background with Text from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless background from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                            if ($global:PosterWithText) {
                                Write-Log -Subtext "Downloading background with Text from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                            Else {
                                Write-Log -Subtext "Downloading Textless background from 'FANART'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            }
                        }
                        elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                            Write-Log -Subtext "Downloading background from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        elseif ($global:posterurl -like "$PlexUrl*") {
                            Write-Log -Subtext "Downloading Background from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        Else {
                            Write-Log -Subtext "Downloading background from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                        }
                        if ($global:ImageProcessing -eq 'true') {
                            Write-Log -Subtext "Processing background for: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        
                            # Calculate the height to maintain the aspect ratio with a width of 1000 pixels
                            if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'true' -and $AddBackgroundOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$Backgroundborderwidthsecond`"  -bordercolor `"$Backgroundbordercolor`" -border `"$Backgroundborderwidth`" `"$backgroundImage`""
                                Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'true') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$Backgroundoverlay`" -gravity south -quality $global:outputQuality -composite `"$backgroundImage`""
                                Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            if ($AddBackgroundBorder -eq 'false' -and $AddBackgroundOverlay -eq 'false') {
                                $Arguments = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                                Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            }
                            $logEntry = "`"$magick`" $Arguments"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
        
                            if ($AddBackgroundText -eq 'true') {
                                $optimalFontSize = Get-OptimalPointSize -text $joinedTitle -font $fontImagemagick -box_width $BackgroundMaxWidth  -box_height $BackgroundMaxHeight -min_pointsize $BackgroundminPointSize -max_pointsize $BackgroundmaxPointSize
                                Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $Arguments = "`"$backgroundImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$Backgroundfontcolor`" -size `"$Backgroundboxsize`" -background none caption:`"$joinedTitle`" -trim -gravity south -extent `"$Backgroundboxsize`" `) -gravity south -geometry +0`"$Backgroundtext_offset`" -quality $global:outputQuality -composite `"$backgroundImage`""
                                Write-Log -Subtext "Applying Background text: `"$joinedTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                $logEntry = "`"$magick`" $Arguments"
                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                            }
                        }
                        Else {
                            $Resizeargument = "`"$backgroundImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$backgroundImage`""
                            Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                            $logEntry = "`"$magick`" $Resizeargument"
                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                        }
                        # Move file back to original naming with Brackets.
                        Move-Item -LiteralPath $backgroundImage $backgroundImageoriginal -Force -ErrorAction SilentlyContinue
                        $BackgroundCount++
                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info

                        $showbackgroundtemp = New-Object psobject
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $Titletext
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Show Background'
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                        $showbackgroundtemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                        # Export the array to a CSV file
                        $showbackgroundtemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        $posterCount++
                    }
                    Else {
                        Write-Log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                        $Errorcount++
                    }
                }
            }
            # Now we can start the Season Part
            if ($global:SeasonPosters -eq 'true') {
                $global:IsFallback = $null
                $global:TextlessPoster = $null
                $global:seasonNames = $entry.SeasonNames -split ','
                $global:seasonNumbers = $entry.seasonNumbers -split ','
                $global:PlexSeasonUrls = $entry.PlexSeasonUrls -split ','
                for ($i = 0; $i -lt $global:seasonNames.Count; $i++) {
                    $global:posterurl = $null
                    $global:TMDBSeasonFallback = $null
                    if ($fontAllCaps -eq 'true') {
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
                    $SeasonImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_$global:season.jpg"
                    $SeasonImage = $SeasonImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                    if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                        if ($PlexToken) {
                            $Arturl = $plexurl + $global:PlexSeasonUrl + "?X-Plex-Token=$PlexToken"
                        }
                        Else {
                            $Arturl = $plexurl + $global:PlexSeasonUrl
                        }
                        if (!$Seasonpostersearchtext) {
                            Write-Log -Message "Start Season Poster Search for: $Titletext" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                                GetPlexArtwork -Type ' a Season Poster' -ArtUrl $Arturl -TempImage $SeasonImage 
                            }
                        }
                        Else {
                            Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                            $global:posterurl = GetFanartSeasonPoster
                            if (!$global:posterurl) {
                                $global:IsFallback = $true
                                if ($entry.tvdbid) {
                                    $global:posterurl = GetTVDBSeasonPoster
                                }
                                if (!$global:posterurl) {
                                    $global:IsFallback = $true
                                    GetPlexArtwork -Type ' a Season Poster' -ArtUrl $Arturl -TempImage $SeasonImage 
                                }
                            }
                        }
                        if ($global:TMDBSeasonFallback -and $global:PosterWithText) {
                            $global:posterurl = $global:TMDBSeasonFallback
                            Write-Log -Subtext "Taking Season Poster with text as fallback from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                            $global:IsFallback = $true
                        }
                        if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                            if ($global:ImageProcessing -eq 'true') {
                                if (!$global:PlexartworkDownloaded) {
                                    Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage
                                }
                                Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Log -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'FANART') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TVDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like "$PlexUrl*") {
                                    Write-Log -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'PLEX') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                    # Resize Image to 2000x3000 and apply Border and overlay
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'true' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" -shave `"$borderwidthsecond`"  -bordercolor `"$bordercolor`" -border `"$borderwidth`" `"$SeasonImage`""
                                        Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'true') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$Posteroverlay`" -gravity south -quality $global:outputQuality -composite `"$SeasonImage`""
                                        Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                    if ($AddBorder -eq 'false' -and $AddOverlay -eq 'false') {
                                        $Arguments = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                        Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    }
                                        
                                    $logEntry = "`"$magick`" $Arguments"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                        
                                    if ($AddText -eq 'true') {
                                        $optimalFontSize = Get-OptimalPointSize -text $global:seasonTitle -font $fontImagemagick -box_width $MaxWidth  -box_height $MaxHeight -min_pointsize $minPointSize -max_pointsize $maxPointSize
                                                
                                        Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                
                                        $Arguments = "`"$SeasonImage`" -gravity center -background None -layers Flatten `( -font `"$fontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$fontcolor`" -size `"$boxsize`" -background none caption:`"$global:seasonTitle`" -trim -gravity south -extent `"$boxsize`" `) -gravity south -geometry +0`"$text_offset`" -quality $global:outputQuality -composite `"$SeasonImage`""
                                                
                                        Write-Log -Subtext "Applying seasonTitle text: `"$global:seasonTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        $logEntry = "`"$magick`" $Arguments"
                                        $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                        Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                    }
                                }
                            }
                            Else {
                                if (!$global:PlexartworkDownloaded) {
                                    Invoke-WebRequest -Uri $global:posterurl -OutFile $SeasonImage
                                }
                                Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                if ($global:posterurl -like 'https://image.tmdb.org*') {
                                    Write-Log -Subtext "Downloading Poster from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://assets.fanart.tv*') {
                                    Write-Log -Subtext "Downloading Poster from 'Fanart.tv'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'FANART') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                    Write-Log -Subtext "Downloading Poster from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'TVDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                elseif ($global:posterurl -like "$PlexUrl*") {
                                    Write-Log -Subtext "Downloading Poster from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    if ($global:FavProvider -ne 'PLEX') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                Else {
                                    Write-Log -Subtext "Downloading Poster from 'IMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                    $PosterUnknownCount++
                                    if ($global:FavProvider -ne 'IMDB') { 
                                        $global:IsFallback = $true
                                    }
                                }
                                if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {    
                                    # Resize Image to 2000x3000
                                    $Resizeargument = "`"$SeasonImage`" -resize `"$PosterSize^`" -gravity center -extent `"$PosterSize`" `"$SeasonImage`""
                                    Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                    $logEntry = "`"$magick`" $Resizeargument"
                                    $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                    Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                                }
                            }
                            if (Get-ChildItem -LiteralPath $SeasonImage -ErrorAction SilentlyContinue) {
                                # Move file back to original naming with Brackets.
                                Move-Item -LiteralPath $SeasonImage -destination $SeasonImageoriginal -Force -ErrorAction SilentlyContinue
                                Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                $SeasonCount++
                                $posterCount++
                            }
                            $seasontemp = New-Object psobject
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($Titletext + " | " + $global:season)
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Season'
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                            $seasontemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
        
                            # Export the array to a CSV file
                            $seasontemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                        }
                        Else {
                            Write-Log -Subtext "Missing poster URL for: $($entry.title)" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Error
                            Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                            $Errorcount++
                        }
                    }
                }
            }
            # Now we can start the Episode Part
            if ($global:TitleCards -eq 'true') {
                # Loop through each episode
                foreach ($episode in $Episodedata) {
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

                    if (($episode.tmdbid -eq $entry.tmdbid -or $episode.tvdbid -eq $entry.tvdbid) -and $episode.'Show Name' -eq $entry.title) {
                        $global:show_name = $episode."Show Name"
                        $global:season_number = $episode."Season Number"
                        $global:episode_numbers = $episode."Episodes".Split(",")
                        $global:titles = $episode."Title".Split(";")
                        $global:PlexTitleCardUrls = $episode."PlexTitleCardUrls".Split(",")
                        for ($i = 0; $i -lt $global:episode_numbers.Count; $i++) {
                            $global:Fallback = $null
                            $global:posterurl = $null

                            $global:PlexTitleCardUrl = $($global:PlexTitleCardUrls[$i].Trim())
                            $global:EPTitle = $($global:titles[$i].Trim())
                            $global:episodenumber = $($global:episode_numbers[$i].Trim())
                            $global:FileNaming = "S" + $global:season_number.PadLeft(2, '0') + "E" + $global:episodenumber.PadLeft(2, '0')
                            $bullet = [char]0x2022
                            $global:SeasonEPNumber = "Season $global:season_number $bullet Episode $global:episodenumber"
                                    
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
                            $EpisodeImage = Join-Path -Path $global:ScriptRoot -ChildPath "temp\$($entry.RootFoldername)_$global:FileNaming.jpg"
                            $EpisodeImage = $EpisodeImage.Replace('[', '_').Replace(']', '_').Replace('{', '_').Replace('}', '_')
                            if (!(Get-ChildItem -LiteralPath $TestPath | Where-Object { $_.Name -like "*$Testfile*" } -ErrorAction SilentlyContinue)) {
                                if (!$Episodepostersearchtext) {
                                    Write-Log -Message "Start Title Card Search for: $global:show_name - $global:SeasonEPNumber" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                                            GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage 
                                        }
                                        if (!$global:posterurl ) {
                                            # Lets just try to grab a background poster.
                                            Write-Log -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug
                                            $global:posterurl = GetTMDBShowBackground
                                            if ($global:posterurl) {
                                                Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                                $global:IsFallback = $true
                                            }
                                            Else {
                                                # Lets just try to grab a background poster.
                                                $global:posterurl = GetTVDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                                    $global:IsFallback = $true
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        Write-Log -Subtext "Can't search on TMDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                        $global:posterurl = GetTVDBTitleCard
                                        if (!$global:posterurl) {
                                            $global:IsFallback = $true
                                            GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage 
                                        }
                                        if (!$global:posterurl ) {
                                            Write-Log -Subtext "No Title Cards for this Episode on TVDB or TMDB..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
                                            # Lets just try to grab a background poster.
                                            Write-Log -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug
                                            $global:posterurl = GetTVDBShowBackground
                                            if ($global:posterurl) {
                                                Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
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
                                            GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage 
                                        }
                                        if (!$global:posterurl ) {
                                            # Lets just try to grab a background poster.
                                            Write-Log -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug
                                            $global:posterurl = GetTVDBShowBackground
                                            if ($global:posterurl) {
                                                Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                                $global:IsFallback = $true
                                            }
                                            Else {
                                                # Lets just try to grab a background poster.
                                                $global:posterurl = GetTMDBShowBackground
                                                if ($global:posterurl) {
                                                    Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                                    $global:IsFallback = $true
                                                }
                                            }
                                        }
                                    }
                                    else {
                                        Write-Log -Subtext "Can't search on TVDB, missing ID..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                        $global:posterurl = GetTMDBTitleCard
                                        if (!$global:posterurl) {
                                            $global:IsFallback = $true
                                            GetPlexArtwork -Type ": $global:show_name 'Season $global:season_number - Episode $global:episodenumber' Title Card" -ArtUrl $ArtUrl -TempImage $EpisodeImage 
                                        }
                                        if (!$global:posterurl ) {
                                            # Lets just try to grab a background poster.
                                            Write-Log -Subtext "Fallback to Show Background..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Debug
                                            $global:posterurl = GetTMDBShowBackground
                                            if ($global:posterurl) {
                                                Write-Log -Subtext "Using the Show Background Poster as TitleCard Fallback..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
                                                $global:IsFallback = $true
                                            }
                                        }
                                    }
                                }
                                if ($global:posterurl -or $global:PlexartworkDownloaded ) {
                                    if ($global:ImageProcessing -eq 'true') {
                                        if (!$global:PlexartworkDownloaded) {
                                            Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage
                                        }
                                        Write-Log -Subtext "Title Card url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                                            Write-Log -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TMDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                            Write-Log -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TVDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like "$PlexUrl*") {
                                            Write-Log -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'PLEX') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                            # Resize Image to 2000x3000 and apply Border and overlay
                                            if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'true') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                Write-Log -Subtext "Resizing it | Adding Borders | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'true' -and $AddTitleCardOverlay -eq 'false') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" -shave `"$TitleCardborderwidthsecond`"  -bordercolor `"$TitleCardbordercolor`" -border `"$TitleCardborderwidth`" `"$EpisodeImage`""
                                                Write-Log -Subtext "Resizing it | Adding Borders" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'true') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$TitleCardoverlay`" -gravity south -quality $global:outputQuality -composite `"$EpisodeImage`""
                                                Write-Log -Subtext "Resizing it | Adding Overlay" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            if ($AddTitleCardBorder -eq 'false' -and $AddTitleCardOverlay -eq 'false') {
                                                $Arguments = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                                Write-Log -Subtext "Resizing it" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            }
                                            $logEntry = "`"$magick`" $Arguments"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                                    
                                            if ($AddTitleCardEPTitleText -eq 'true') {
                                                if ($TitleCardEPTitlefontAllCaps -eq 'true') {
                                                    $global:EPTitle = $global:EPTitle.ToUpper()
                                                }
                                                $optimalFontSize = Get-OptimalPointSize -text $global:EPTitle -font $TitleCardfontImagemagick -box_width $TitleCardEPTitleMaxWidth  -box_height $TitleCardEPTitleMaxHeight -min_pointsize $TitleCardEPTitleminPointSize -max_pointsize $TitleCardEPTitlemaxPointSize
                                                                
                                                Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                                
                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPTitlefontcolor`" -size `"$TitleCardEPTitleboxsize`" -background none caption:`"$global:EPTitle`" -trim -gravity south -extent `"$TitleCardEPTitleboxsize`" `) -gravity south -geometry +0`"$TitleCardEPTitletext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""
                                                                
                                                Write-Log -Subtext "Applying EPTitle text: `"$global:EPTitle`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                $logEntry = "`"$magick`" $Arguments"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                                        
                                            }
                                            if ($AddTitleCardEPText -eq 'true') {
                                                if ($TitleCardEPfontAllCaps -eq 'true') {
                                                    $global:SeasonEPNumber = $global:SeasonEPNumber.ToUpper()
                                                }
                                                $optimalFontSize = Get-OptimalPointSize -text  $global:SeasonEPNumber -font $TitleCardfontImagemagick -box_width $TitleCardEPMaxWidth  -box_height $TitleCardEPMaxHeight -min_pointsize $TitleCardEPminPointSize -max_pointsize $TitleCardEPmaxPointSize
                                                                
                                                Write-Log -Subtext "Optimal font size set to: '$optimalFontSize'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                                
                                                $Arguments = "`"$EpisodeImage`" -gravity center -background None -layers Flatten `( -font `"$TitleCardfontImagemagick`" -pointsize `"$optimalFontSize`" -fill `"$TitleCardEPfontcolor`" -size `"$TitleCardEPboxsize`" -background none caption:`"$global:SeasonEPNumber`" -trim -gravity south -extent `"$TitleCardEPboxsize`" `) -gravity south -geometry +0`"$TitleCardEPtext_offset`" -quality $global:outputQuality -composite `"$EpisodeImage`""
                                                                
                                                Write-Log -Subtext "Applying SeasonEPNumber text: `"$global:SeasonEPNumber`"" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                                $logEntry = "`"$magick`" $Arguments"
                                                $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                                Start-Process $magick -Wait -NoNewWindow -ArgumentList $Arguments
                                            }
                                        }
                                    }
                                    Else {
                                        if (!$global:PlexartworkDownloaded) {
                                            Invoke-WebRequest -Uri $global:posterurl -OutFile $EpisodeImage
                                        }
                                        Write-Log -Subtext "Poster url: $global:posterurl" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                        if ($global:posterurl -like 'https://image.tmdb.org*') {
                                            Write-Log -Subtext "Downloading Title Card from 'TMDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TMDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like 'https://artworks.thetvdb.com*') {
                                            Write-Log -Subtext "Downloading Title Card from 'TVDB'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'TVDB') { 
                                                $global:IsFallback = $true
                                            }
                                        }
                                        if ($global:posterurl -like "$PlexUrl*") {
                                            Write-Log -Subtext "Downloading Title Card from 'Plex'" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type debug
                                            if ($global:FavProvider -ne 'PLEX') { 
                                                $global:IsFallback = $true
                                            }
                                        }                                           
                                        if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {    
                                            # Resize Image to 2000x3000
                                            $Resizeargument = "`"$EpisodeImage`" -resize `"$BackgroundSize^`" -gravity center -extent `"$BackgroundSize`" `"$EpisodeImage`""
                                            Write-Log -Subtext "Resizing it... " -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
                                            $logEntry = "`"$magick`" $Resizeargument"
                                            $logEntry | Out-File $global:ScriptRoot\Logs\ImageMagickCommands.log -Append 
                                            Start-Process $magick -Wait -NoNewWindow -ArgumentList $Resizeargument
                                        }
                                    }
                                    if (Get-ChildItem -LiteralPath $EpisodeImage -ErrorAction SilentlyContinue) {
                                        # Move file back to original naming with Brackets.
                                        Move-Item -LiteralPath $EpisodeImage -destination $EpisodeImageoriginal -Force -ErrorAction SilentlyContinue
                                        Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                        $EpisodeCount++
                                        $posterCount++
                                    }
                                    $episodetemp = New-Object psobject
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Title" -Value $($global:FileNaming + " | " + $global:EPTitle)
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Type" -Value 'Episode'
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Rootfolder" -Value $($entry.RootFoldername)
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "LibraryName" -Value $($entry.'Library Name')
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Textless" -Value $(if ($global:TextlessPoster) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Fallback" -Value $(if ($global:IsFallback) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "TextTruncated" -Value $(if ($global:IsTruncated) { 'True' } else { 'False' })
                                    $episodetemp | Add-Member -MemberType NoteProperty -Name "Url" -Value $global:posterurl
                            
                                    # Export the array to a CSV file
                                    $episodetemp | Export-Csv -Path "$global:ScriptRoot\Logs\ImageChoices.csv" -NoTypeInformation -Delimiter ';' -Encoding UTF8 -Force -Append
                                }
                                Else {
                                    Write-Log -Subtext "--------------------------------------------------------------------------------" -Path $global:ScriptRoot\Logs\Scriptlog.log  -Type Info
                                    $Errorcount++
                                }
                                        
                            }
                        }
                    }

                }
            }
        }
        Else {
            Write-Log -Message "Missing RootFolder for: $($entry.title) - you have to manually create the poster for it..." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Error
            $Errorcount++
        }
    }
    $endTime = Get-Date
    $executionTime = New-TimeSpan -Start $startTime -End $endTime
    # Format the execution time
    $hours = [math]::Floor($executionTime.TotalHours)
    $minutes = $executionTime.Minutes
    $seconds = $executionTime.Seconds
    $FormattedTimespawn = $hours.ToString() + "h " + $minutes.ToString() + "m " + $seconds.ToString() + "s "

    Write-Log -Message "Finished, Total images created: $posterCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    if ($posterCount -ge '1') {
        Write-Log -Message "Show/Movie Posters created: $($posterCount-$SeasonCount-$BackgroundCount-$EpisodeCount)| Season images created: $SeasonCount | Background images created: $BackgroundCount | TitleCards created: $EpisodeCount" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Success
    }
    if ((Test-Path $global:ScriptRoot\Logs\ImageChoices.csv)) {
        Write-Log -Message "You can find a detailed Summary of image Choices here: $global:ScriptRoot\Logs\ImageChoices.csv" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
        # Calculate Summary
        $SummaryCount = Import-Csv -LiteralPath "$global:ScriptRoot\Logs\ImageChoices.csv" -Delimiter ';'
        $FallbackCount = @($SummaryCount | Where-Object Fallback -eq 'True')
        $TextlessCount = @($SummaryCount | Where-Object Textless -eq 'True')
        $TextTruncatedCount = @($SummaryCount | Where-Object TextTruncated -eq 'True')
        $TextCount = @($SummaryCount | Where-Object Textless -eq 'False')

        if ($TextlessCount) {
            Write-Log -Subtext "'$($TextlessCount.count)' times the script took a Textless image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($FallbackCount) {
            Write-Log -Subtext "'$($FallbackCount.count)' times the script took a fallback image" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($TextCount) {
            Write-Log -Subtext "'$($TextCount.count)' times the script took a image with Text" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($PosterUnknownCount -ge '1') {
            Write-Log -Subtext "'$PosterUnknownCount' times the script took a season poster where we cant tell if it has text or not" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
        if ($TextTruncatedCount) {
            Write-Log -Subtext "'$($TextTruncatedCount.count)' times the script truncated the text in images" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Warning
        }
    }
    if ($Errorcount -ge '1') {
        Write-Log -Message "During execution '$Errorcount' Errors occurred, please check log for detailed description." -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
    }
    Write-Log -Message "Script execution time: $FormattedTimespawn" -Path $global:ScriptRoot\Logs\Scriptlog.log -Type Info
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
                "description": "PPM run took: $FormattedTimespawn $(if ($Errorcount -ge '1') {"\n During execution Errors occurred, please check log for detailed description."})",
                "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                "color": $(if ($Errorcount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                "fields": [
                {
                    "name": "",
                    "value": ":bar_chart:",
                    "inline": false
                },
                {
                    "name": "Errors",
                    "value": "$Errorcount",
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
                if ($Errorcount -ge '1') {
                    apprise --notification-type="error" --title="Plex-Poster-Maker" --body="PPM run took: $FormattedTimespawn`nIt Created '$posterCount' Images`n`nDuring execution '$Errorcount' Errors occurred, please check log for detailed description." "$global:NotifyUrl" 
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
                "description": "PPM run took: $FormattedTimespawn $(if ($Errorcount -ge '1') {"\n During execution Errors occurred, please check log for detailed description."})",
                "timestamp": "$(((Get-Date).ToUniversalTime()).ToString("yyyy-MM-ddTHH:mm:ss.fffZ"))",
                "color": $(if ($Errorcount -ge '1') {16711680}Elseif ($Testing){8388736}Elseif ($FallbackCount.count -gt '1' -or $PosterUnknownCount -ge '1' -or $TextTruncatedCount.count -gt '1'){15120384}Else{5763719}),
                "fields": [
                {
                    "name": "",
                    "value": ":bar_chart:",
                    "inline": false
                },
                {
                    "name": "Errors",
                    "value": "$Errorcount",
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
