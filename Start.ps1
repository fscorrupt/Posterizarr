function ScriptSchedule {
    # Posterizarr File Watcher for Tautulli Recently Added Files
    $inputDir = "$env:APP_DATA/watcher"
    $Directory = Get-ChildItem -Name $inputDir

    if (!$env:RUN_TIME) {
        $env:RUN_TIME = "05:00" # Set default value if not provided
    }

    $NextScriptRun = $env:RUN_TIME -split ',' | Sort-Object

    Write-Host "File Watcher Started..."
    write-host "UI is being initialized... T-60 seconds" -ForegroundColor Green
    # Next Run
    while ($true) {
        $elapsedTime = $(get-date) - $StartTime
        $totalTime = $elapsedTime.Days.ToString() + ' Days ' + $elapsedTime.Hours.ToString() + ' Hours ' + $elapsedTime.Minutes.ToString() + ' Min ' + $elapsedTime.Seconds.ToString() + ' Sec'
        $env:RUN_TIME = $env:RUN_TIME.ToLower()

        if ($env:RUN_TIME -ne "disabled") {
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
                    Offset  = $offset.TotalSeconds
                }
            } | Sort-Object -Property Offset | Select-Object -First 1

            # Use the nearest scheduled run time
            $NextScriptRunTime = $NextScriptRun.RunTime
            $NextScriptRunOffset = $NextScriptRun.Offset
            if (!$alreadydisplayed) {
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
                if ((Get-Process pwsh -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*Posterizarr.ps1*" })) {
                    Write-Warning "There is currently running another Process of Posterizarr, skipping this run."
                }
                Else {
                    pwsh -File "$env:APP_ROOT/Posterizarr.ps1"
                }
            }
        }
        If ($Directory) {
            $Triggers = Get-ChildItem $inputDir -Recurse | Where-Object -FilterScript {
                $_.Extension -match 'posterizarr'
            }

            foreach ($item in $Triggers) {
                write-host "Found .posterizarr file..."

                # Get trigger Values
                $triggerargs = Get-Content $item.FullName

                # Reset scriptargs
                $IsTautulli = $false
                if ($triggerargs -like '*arr_*') {
                    $ScriptArgs = @("-ArrTrigger")
                    # Extract timestamp from filename
                    if ($item.BaseName -match 'recently_added_(\d+)') {
                        $timestamp = $matches[1]
                        # Take only the first 14 digits (yyyyMMddHHmmss)
                        $timestamp14 = $timestamp.Substring(0,14)

                        # Convert to datetime
                        $fileTime = [datetime]::ParseExact($timestamp14, "yyyyMMddHHmmss", $null)

                        # Calculate age in seconds
                        $fileAge = (Get-Date) - $fileTime
                        $waitTime = [Math]::Max(0, 300 - $fileAge.TotalSeconds)  # 5 min buffer

                        if ($waitTime -gt 0) {
                            write-host "Waiting $([math]::Round($waitTime)) seconds for media server..."
                            Start-Sleep -Seconds $waitTime
                        }
                    }
                    foreach ($line in $triggerargs) {
                        if ($line -match '^\[(.+)\]: (.+)$') {
                            $arg_name = $matches[1]
                            $arg_value = $matches[2]

                            # Add key/value to args
                            $ScriptArgs += "-$arg_name"
                            $ScriptArgs += $arg_value
                        }
                    }
                } Else {
                    $IsTautulli = $true
                    $ScriptArgs = "-Tautulli"
                    foreach ($line in $triggerargs) {
                        if ($line -match '^\[(.+)\]: (.+)$') {
                            $arg_name = $matches[1]
                            $arg_value = $matches[2]
                            $Scriptargs += " -$arg_name $arg_value"
                        }
                    }
                }

                write-host "Building trigger args..."
                # Wait until no other Posterizarr process is running
                while (Get-Process pwsh -ErrorAction SilentlyContinue |
                    Where-Object { $_.CommandLine -like "*Posterizarr.ps1*" }) {
                    Write-Warning "Posterizarr is already running. Waiting 20 seconds..."
                    Start-Sleep -Seconds 20
                }

                if ($IsTautulli) {
                    Write-Host "Calling Posterizarr with these args: $ScriptArgs"
                    pwsh -Command "$env:APP_ROOT/Posterizarr.ps1 $ScriptArgs"
                } else {
                    Write-Host "Calling Posterizarr with these args: $($ScriptArgs -join ' ')"

                    # Call Posterizarr with Args
                    pwsh -File "$env:APP_ROOT/Posterizarr.ps1" @ScriptArgs
                }


                write-host ""
                if ($triggerargs -like '*arr_*') {
                    write-host "Arr Recently added finished, removing trigger file: $($item.Name)"
                }
                else {
                    write-host "Tautulli Recently added finished, removing trigger file: $($item.Name)"
                }
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
        if (!$Directory) {
            Start-Sleep -Seconds 30
            $Directory = Get-ChildItem -Name $inputDir
        }
    }
}
function GetLatestScriptVersion {
    try {
        return Invoke-RestMethod -Uri "https://github.com/fscorrupt/Posterizarr/raw/main/Release.txt" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Host "Could not query latest script version, Error: $($_.Exception.Message)"
        return $null
    }
}
function CompareScriptVersion {
    <#
    .SYNOPSIS
        Compares the current script version with the latest available version
    .DESCRIPTION
        Extracts the version from Posterizarr.ps1 and compares it with
        the latest version from GitHub, displaying the results
    #>
    try {
        $posterizarrPath = "$env:APP_ROOT/Posterizarr.ps1"
        if (Test-Path $posterizarrPath) {
            $lineContainingVersion = Select-String -Path $posterizarrPath -Pattern '^\$CurrentScriptVersion\s*=\s*"([^"]+)"' | Select-Object -ExpandProperty Line
            $LatestScriptVersion = GetLatestScriptVersion

            if ($lineContainingVersion) {
                # Extract the version from the line
                Write-Host ""
                $version = $lineContainingVersion -replace '^\$CurrentScriptVersion\s*=\s*"([^"]+)".*', '$1'
                Write-Host "Current Script Version: $version | Latest Script Version: $LatestScriptVersion" -ForegroundColor Green
            }
        }
        else {
            Write-Host "Warning: Could not find Posterizarr.ps1 at $posterizarrPath" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "Error checking script version: $($_.Exception.Message)" -ForegroundColor Red
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
function CopyAssetFiles {
    <#
    .SYNOPSIS
        Copies asset files from APP_ROOT to APP_DATA/Overlayfiles and config to APP_DATA if missing.
        Migrates any .png, .ttf, .otf files from APP_DATA to Overlayfiles.
    .DESCRIPTION
        Copies all .png, .ttf, .otf files from the APP_ROOT directory to the APP_DATA/Overlayfiles directory,
        but only if they do not already exist in Overlayfiles.
        Special rule: config.example.json is only copied if config.json does not exist in APP_DATA.
        Also moves any .png, .ttf, .otf files found in APP_DATA to Overlayfiles.
    #>

    $overlayDir = "$env:APP_DATA/Overlayfiles"
    if (-not (Test-Path $overlayDir)) {
        $null = New-Item -Path $overlayDir -ItemType Directory -ErrorAction SilentlyContinue
    }

    # Migrate .png, .ttf, .otf files from APP_DATA to Overlayfiles
    $migrateFiles = Get-ChildItem -Path $env:APP_DATA -Include "*.png", "*.ttf", "*.otf" -File
    $migratedCount = 0
    foreach ($file in $migrateFiles) {
        $dest = Join-Path -Path $overlayDir -ChildPath $file.Name
        try {
            Move-Item -LiteralPath $file.FullName -Destination $dest -Force
            $migratedCount++
            Write-Host "Migrated $($file.Name) to $overlayDir" -ForegroundColor Cyan
        }
        catch {
            Write-Host "Failed to migrate $($file.Name): $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    if ($migratedCount -gt 0) {
        Write-Host "Migrated $migratedCount files from APP_DATA to Overlayfiles." -ForegroundColor Green
    }

    # Get all asset files from APP_ROOT
    $assetFiles = Get-ChildItem -Path "$env:APP_ROOT/*" -Include "*.png", "*.ttf", "*.otf", "config.example.json" -File
    $fileCount = $assetFiles.Count

    if ($fileCount -eq 0) {
        Write-Host "No asset files found in $env:APP_ROOT" -ForegroundColor Yellow
    }
    else {
        $copiedCount = 0
        $skippedCount = 0
        $errorCount = 0

        $assetFiles | ForEach-Object {
            try {
                if ($_.Name -eq "config.example.json") {
                    $configJsonPath = Join-Path -Path $env:APP_DATA -ChildPath "config.json"
                    $destinationPath = Join-Path -Path $env:APP_DATA -ChildPath $_.Name

                    if (-Not (Test-Path -Path $configJsonPath)) {
                        if (-Not (Test-Path -Path $destinationPath)) {
                            Copy-Item -Path $_.FullName -Destination $destinationPath -Force
                            $copiedCount++
                        }
                        else {
                            $skippedCount++
                        }
                    }
                    else {
                        $skippedCount++
                    }
                }
                else {
                    $destinationPath = Join-Path -Path $overlayDir -ChildPath $_.Name
                    if (-Not (Test-Path -Path $destinationPath)) {
                        Copy-Item -Path $_.FullName -Destination $destinationPath -Force
                        $copiedCount++
                    }
                    else {
                        $skippedCount++
                    }
                }
            }
            catch {
                $errorCount++
                Write-Host "Failed to copy $($_.Name): $($_.Exception.Message)" -ForegroundColor Red
            }
        }

        # Summary
        Write-Host "Copied $copiedCount new asset files" -ForegroundColor Cyan
        Write-Host "Skipped $skippedCount files (already exist or not needed)" -ForegroundColor Gray

        if ($errorCount -gt 0) {
            Write-Host "Failed to copy $errorCount files" -ForegroundColor Yellow
        }
    }
}

Set-PSReadLineOption -HistorySaveStyle SaveNothing

$Header = @"
----------------------------------------------------
Ideas for the container were taken from:
DapperDrivers & Onedr0p
----------------------------------------------------
======================================================
  _____          _            _
 |  __ \        | |          (_)
 | |__) |__  ___| |_ ___ _ __ _ ______ _ _ __ _ __
 |  ___/ _ \/ __| __/ _ \ '__| |_  / _``` | '__| '__|
 | |  | (_) \__ \ ||  __/ |  | |/ / (_| | |  | |
 |_|   \___/|___/\__\___|_|  |_/___\__,_|_|  |_|
 ======================================================
 To support the projects visit:
 https://github.com/fscorrupt/Posterizarr
----------------------------------------------------
"@

Write-Host $Header

if (!$env:APP_ROOT) {
    $env:APP_ROOT = "/app"
}

if (!$env:APP_DATA) {
    $env:APP_DATA = "/config"
}

$ProgressPreference = 'Continue'

# Check script version
CompareScriptVersion

# Creating Folder structure
$folders = @("$env:APP_DATA/Logs", "$env:APP_DATA/temp", "$env:APP_DATA/watcher", "$env:APP_DATA/test", "$env:APP_DATA/Overlayfiles")
$createdFolders = @()
$allPresent = $true

foreach ($folder in $folders) {
    if (-not (Test-Path $folder)) {
        $null = New-Item -Path $folder -ItemType Directory -ErrorAction SilentlyContinue
        $createdFolders += $folder
        $allPresent = $false
    }
}

if ($allPresent) {
    Write-Host "All folders are already present. Folder creation skipped." -ForegroundColor Green
}
else {
    Write-Host "The following folders were created:" -ForegroundColor Cyan
    foreach ($createdFolder in $createdFolders) {
        Write-Host "    - $createdFolder" -ForegroundColor Yellow
    }
}

# Move assets to APP_DATA
CopyAssetFiles

# Checking Config file
if (-not (test-path "$env:APP_DATA/config.json")) {
    Write-Host ""
    Write-Host "Could not find a 'config.json' file" -ForegroundColor Red
    Write-Host "Please edit the config.example.json according to GH repo and save it as 'config.json'" -ForegroundColor Yellow
    Write-Host "    After that restart the container..."
    Write-Host "Waiting for config.json file to be created..."
    do {
        Start-Sleep 600
    } until (
        test-path "$env:APP_DATA/config.json"
    )
}

# Check temp dir if there is a Currently running file present
$CurrentlyRunning = "$env:APP_DATA/temp/Posterizarr.Running"

# Clear Running File
if (Test-Path $CurrentlyRunning) {
    Remove-Item -LiteralPath $CurrentlyRunning | out-null
    write-host "Cleared .running file..." -ForegroundColor Green
}

# Show integraded Scripts
$StartTime = Get-Date
write-host "Container Started..." -ForegroundColor Green
ScriptSchedule