$env:PSModuleAnalysisCachePath = $null
$env:PSModuleAnalysisCacheEnabled = $false

function ScriptSchedule {
    # Posterizarr File Watcher for Tautulli Recently Added Files
    $inputDir = '/config/watcher'
    $Scriptargs = "-Tautulli"
    $Directory = Get-ChildItem -Name $inputDir

    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00"  # Set default value if not provided
    }

    $NextScriptRun = $env:RUN_TIME -split ',' | Sort-Object

    Write-Host "File Watcher Started..."
    # Next Run
    while ($true) {
        $elapsedTime = $(get-date) - $StartTime
        $totalTime = $elapsedTime.Days.ToString() + ' Days ' + $elapsedTime.Hours.ToString() + ' Hours ' + $elapsedTime.Minutes.ToString() + ' Min ' + $elapsedTime.Seconds.ToString() + ' Sec'
        $NextScriptRun = $env:RUN_TIME -split ',' | ForEach-Object {
            $Hour = $_.split(':')[0]
            $Minute = $_.split(':')[1]
            $NextTrigger = Get-Date -Hour $Hour -Minute $Minute
            $CurrentTime = Get-Date
            if ($NextTrigger -lt $CurrentTime) {
                $NextTrigger = $NextTrigger.AddDays(1)
            }
            $offset = $NextTrigger - $CurrentTime
            [PSCustomObject]@{
                RunTime = $_
                Offset = $offset.TotalSeconds
            }
        } | Sort-Object -Property Offset | Select-Object -First 1

        # Use the nearest scheduled run time
        $NextScriptRunTime = $NextScriptRun.RunTime
        $NextScriptRunOffset = $NextScriptRun.Offset
        if (!$alreadydisplayed){
            write-host ""
            write-host "Container is running since: " -NoNewline
            write-host "$totalTime" -ForegroundColor Cyan
            CompareScriptVersion
            write-host ""
            Write-Host "Next Script Run is at: $NextScriptRunTime"
            $alreadydisplayed = $true
        }
        if ($NextScriptRunOffset -le '60') {
            $alreadydisplayed = $null
            Start-Sleep $NextScriptRunOffset
            # Calling the Posterizarr Script
            if ((Get-Process | Where-Object commandline -like 'pwsh')) {
                Write-Warning "There is currently running another Process of Posterizarr, skipping this run."
            }
            Else {
                pwsh -NoProfile /config/Posterizarr.ps1 -dev
            }
        }
        If ($Directory)
        {
            $TautulliTriggers = Get-ChildItem $inputDir -Recurse | Where-Object -FilterScript {
                $_.Extension -match 'posterizarr'
            }

            foreach($item in $TautulliTriggers)
            {
                write-host "Found .posterizarr file..."

                # Get trigger Values
                $triggerargs = Get-Content $item

                # Replace args
                foreach ($line in $triggerargs) {
                    if ($line -match '^\[(.+)\]: (.+)$') {
                        $arg_name = $matches[1]
                        $arg_value = $matches[2]
                        $Scriptargs += " -$arg_name $arg_value"
                    }
                }
                $Scriptargs += " -dev"
                write-host "Building trigger args..."
                write-host "Calling Posterizarr with this args: $Scriptargs"

                # Call Posterizarr with Args
                pwsh -NoProfile -Command "/config/Posterizarr.ps1 $Scriptargs"

                # Reset scriptargs
                $Scriptargs = "-Tautulli"
                write-host ""
                write-host "Tautulli Recently added finished, removing trigger file: $($item.Name)"
                write-host ""
                write-host "Container is running since: " -NoNewline
                write-host "$totalTime" -ForegroundColor Cyan
                CompareScriptVersion
                write-host ""
                Write-Host "Next Script Run is at: $NextScriptRunTime"
                Remove-Item "$inputDir/$($item.Name)" -Force -Confirm:$false
            }

            $Directory = Get-ChildItem -Name $inputDir
        }
        if (!$Directory)
        {
            Start-Sleep -Seconds 30
            $Directory = Get-ChildItem -Name $inputDir
        }
    }
}
function GetLatestScriptVersion {
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Posterizarr/raw/dev/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Host "Could not query latest script version, Error: $($_.Exception.Message)"
        return $null
    }
}
function CompareScriptVersion {
    # Current Imagemagick Version
    $magick = 'magick'
    $CurrentImagemagickversion = & $magick -version
    $CurrentImagemagickversion = [regex]::Match($CurrentImagemagickversion, 'Version: ImageMagick (\d+(\.\d+){1,2}-\d+)')
    $CurrentImagemagickversion = $CurrentImagemagickversion.Groups[1].Value.replace('-', '.')

    # Latest Imagemagick Version
    $Url = "https://pkgs.alpinelinux.org/package/edge/community/x86_64/imagemagick"
    $response = Invoke-WebRequest -Uri $url
    $htmlContent = $response.Content
    $regexPattern = '<th class="header">Version<\/th>\s*<td>\s*<strong>\s*<a[^>]*>([^<]+)<\/a>\s*<\/strong>\s*<\/td>'
    $Versionmatching = [regex]::Matches($htmlContent, $regexPattern)

    if ($Versionmatching.Count -gt 0) {
        $LatestImagemagickversion = $Versionmatching[0].Groups[1].Value.split('-')[0]
    }
    # Use Select-String to find the line containing the variable assignment
    $lineContainingVersion = Select-String -Path "/config/Posterizarr.ps1" -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
    $LatestScriptVersion = GetLatestScriptVersion
    if ($lineContainingVersion) {
        # Extract the version from the line
        write-host ""
        $version = $lineContainingVersion -replace '^\$CurrentScriptVersion\s*=\s*"([^"]+)".*', '$1'
        write-host "Current Script Version: $version | Latest Script Version: $LatestScriptVersion" -ForegroundColor Green
    }
    if ($CurrentImagemagickversion -and $LatestImagemagickversion) {
        write-host "Current Imagemagick Version: $CurrentImagemagickversion | Latest Imagemagick Version: $LatestImagemagickversion"
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

# Download latest Script file
$ProgressPreference = 'SilentlyContinue'
$ProgressPreference = 'Continue'

# Checking Config file
if (-not (test-path "/config/config.json")) {
    Write-Host ""
    Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
    Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
    Write-Host "    After that restart the container..."
    Write-Host "Exiting now"
    do {
        Start-Sleep 600
    } until (
        test-path "/config/config.json"
    )
}

# Check if the FanartTvAPI module is installed
$moduleName = 'FanartTvAPI'
$module = Get-Module -ListAvailable -Name $moduleName

if (-not $module) {
    # Try to install the module
    try {
        Install-Module -Name $moduleName -Force -SkipPublisherCheck -AllowPrerelease -Scope AllUsers
    } catch {
        Write-Host "Failed to install $moduleName module. Error: $_"
    }
}

# Check temp dir if there is a Currently running file present
$CurrentlyRunning = "/config/temp/Posterizarr.Running"

# Clear Running File
if (Test-Path $CurrentlyRunning) {
    Remove-Item -LiteralPath $CurrentlyRunning | out-null
    write-host "Cleared .running file..." -ForegroundColor Green
}

# Show integraded Scripts
$StartTime = Get-Date
write-host "Container Started..." -ForegroundColor Green
ScriptSchedule
