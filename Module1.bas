Attribute VB_Name = "Module1"
Option Explicit
Sub PromptUser()
    Dim folderPath As String
    Dim FilenamePPM As String
    Dim currentVersion As String
    
    ' Specify the current version number
    currentVersion = "1.0.2"
    
    ' Check for updates
    CheckForUpdate currentVersion
    
    ' Get the current filename
    FilenamePPM = ThisWorkbook.FullName
    
    ' Check if the current filename is not "PPM.xlsm"
    If InStrRev(FilenamePPM, "\PPM.xlsm") = 0 Then
        ' Rename the workbook to "PPM.xlsm"
        MsgBox "Renaming file to PPM.xlsm", vbInformation
        FilenamePPM = Replace(FilenamePPM, ThisWorkbook.Name, "PPM.xlsm")
        Application.DisplayAlerts = False ' Disable alerts temporarily
        ThisWorkbook.SaveAs Filename:=FilenamePPM, FileFormat:=xlOpenXMLWorkbookMacroEnabled, CreateBackup:=False
        Application.DisplayAlerts = True ' Re-enable alerts
    End If

    ' Remove all sheets and only keep PPM sheet
    KeepOnlyPPMSheet
    
    ' Create the Fancy Button on PPM sheet
    AddOrUpdateFancyButtonToPPM
    
    ' Prompt the user to select a folder
    folderPath = GetFolderPath("Select the folder containing the PPM csv files")
    
    ' Check if a folder is selected
    If folderPath <> "" Then
        ' Call the macro with the folder path
        ImportCSVs folderPath
    Else
        MsgBox "No folder selected. Operation canceled.", vbCritical
    End If

    ' Remove personal info and save the workbook without prompting
    RemoveDocumentPersonalInfo
    Application.DisplayAlerts = False ' Disable alerts
    ThisWorkbook.SaveAs Filename:=FilenamePPM, FileFormat:=xlOpenXMLWorkbookMacroEnabled, CreateBackup:=False
    Application.DisplayAlerts = True ' Re-enable alerts
    MsgBox "Workbook saved successfully.", vbInformation
End Sub

Sub ConvertToClickableLinks(ws As Worksheet, rng As Range)
    Dim cell As Range
    
    ' Loop through each non-blank cell in the range and convert URLs to clickable hyperlinks
    For Each cell In rng
        If cell.Value <> "" And (InStr(1, cell.Value, "http://") > 0 Or InStr(1, cell.Value, "https://") > 0) Then
            ' Add hyperlink
            ws.Hyperlinks.Add Anchor:=cell, Address:=cell.Value
        End If
        
        ' Debug statement to display the address of the cell currently being evaluated
        ' Debug.Print "Evaluated cell address: " & cell.Address
    Next cell
End Sub
Sub ImportCSVs(folderPath)
    Dim Filename1 As String
    Dim Filename2 As String
    Dim Filename3 As String
    Dim conn As WorkbookConnection
    Dim q
    Dim ws As Worksheet
    
    ' Concatenate folder path with filenames
    Filename1 = folderPath & "\ImageChoices.csv"
    Filename2 = folderPath & "\PlexLibexport.csv"
    Filename3 = folderPath & "\PlexEpisodeExport.csv"
    
    ' Validate filenames
    If Not ValidateFilenames(Filename1, Filename2, Filename3) Then
        PromptUser ' Ask user to find logs again
        Exit Sub
    End If
    
    ' Check if connections already exist and delete them if they do
    For Each conn In ThisWorkbook.Connections
        If conn.Name = "ImageChoices" Or conn.Name = "PlexLibexport" Or conn.Name = "PlexEpisodeExport" Then
            conn.Delete
        End If
    Next conn
    
    ' Check if queries already exist and delete them if they do
    For Each q In ThisWorkbook.Queries
        If q.Name = "ImageChoices" Or q.Name = "PlexLibexport" Or q.Name = "PlexEpisodeExport" Then
            q.Delete
        End If
    Next q
    
    ' Check if sheets already exist and delete them if they do
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name = "ImageChoices" Or ws.Name = "PlexLibexport" Or ws.Name = "PlexEpisodeExport" Then
            Application.DisplayAlerts = False ' Disable alert for deleting sheets
            ws.Delete
            Application.DisplayAlerts = True
        End If
    Next ws
    
    Dim wsImageChoices As Worksheet
    Dim wsPlexLibexport As Worksheet
    Dim wsPlexEpisodeExport As Worksheet
    Dim wsSheet As Worksheet
    Dim rngURLs As Range
 
    Set wsImageChoices = ThisWorkbook.Worksheets.Add
    wsImageChoices.Name = "ImageChoices"
    ThisWorkbook.Queries.Add Name:="ImageChoices", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & " Source = Csv.Document(File.Contents(""" & Filename1 & """),[Delimiter="";"", Columns=9, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Title"", type text}, {""Type"", t" & _
        "ype text}, {""Rootfolder"", type text}, {""LibraryName"", type text}, {""Language"", type text}, {""Fallback"", type logical}, {""TextTruncated"", type logical}, {""Download Source"", type text}, {""Fav Provider Link"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""
        
    With wsImageChoices.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=ImageChoices;Extended Properties=""""", Destination:=wsImageChoices.Range("$A$1")).QueryTable
        .CommandType = xlCmdSql
        .CommandText = Array("SELECT * FROM [ImageChoices]")
        .RowNumbers = False
        .FillAdjacentFormulas = False
        .PreserveFormatting = True
        .RefreshOnFileOpen = False
        .BackgroundQuery = True
        .RefreshStyle = xlInsertDeleteCells
        .SavePassword = False
        .SaveData = True
        .AdjustColumnWidth = True
        .RefreshPeriod = 0
        .PreserveColumnInfo = True
        .ListObject.DisplayName = "ImageChoices"
        .Refresh BackgroundQuery:=False
        .ListObject.ShowTotals = True
    End With
    
    Set wsSheet = ThisWorkbook.Sheets("ImageChoices")
    Set rngURLs = wsSheet.UsedRange
    ConvertToClickableLinks wsSheet, rngURLs
    
    Set wsPlexLibexport = ThisWorkbook.Worksheets.Add
    wsPlexLibexport.Name = "PlexLibexport"
    ThisWorkbook.Queries.Add Name:="PlexLibexport", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & "    Source = Csv.Document(File.Contents(""" & Filename2 & """),[Delimiter="";"", Columns=18, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Library Name"", type text}, {""" & _
        "Library Type"", type text}, {""title"", type text}, {""originalTitle"", type text}, {""SeasonNames"", type text}, {""SeasonNumbers"", type text}, {""SeasonRatingKeys"", type text}, {""year"", Int64.Type}, {""tvdbid"", type text}, {""imdbid"", type text}, {""tmdbid"", type text}, {""ratingKey"", type text}, {""Path"", type text}, {""RootFoldername"", type text" & _
        "}, {""MultipleVersions"", type logical}, {""PlexPosterUrl"", type text}, {""PlexBackgroundUrl"", type text}, {""PlexSeasonUrls"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""

    With wsPlexLibexport.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=PlexLibexport;Extended Properties=""""", Destination:=wsPlexLibexport.Range("$A$1")).QueryTable
        .CommandType = xlCmdSql
        .CommandText = Array("SELECT * FROM [PlexLibexport]")
        .RowNumbers = False
        .FillAdjacentFormulas = False
        .PreserveFormatting = True
        .RefreshOnFileOpen = False
        .BackgroundQuery = True
        .RefreshStyle = xlInsertDeleteCells
        .SavePassword = False
        .SaveData = True
        .AdjustColumnWidth = True
        .RefreshPeriod = 0
        .PreserveColumnInfo = True
        .ListObject.DisplayName = "PlexLibexport"
        .Refresh BackgroundQuery:=False
        .ListObject.ShowTotals = True
    End With
    
    Set wsSheet = ThisWorkbook.Sheets("PlexLibexport")
    Set rngURLs = wsSheet.UsedRange
    ConvertToClickableLinks wsSheet, rngURLs
   
    Set wsPlexEpisodeExport = ThisWorkbook.Worksheets.Add
    wsPlexEpisodeExport.Name = "PlexEpisodeExport"
    ThisWorkbook.Queries.Add Name:="PlexEpisodeExport", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & "    Source = Csv.Document(File.Contents(""" & Filename3 & """),[Delimiter="";"", Columns=9, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Show Name"", type text}, {""" & _
        "Type"", type text}, {""tvdbid"", type text}, {""tmdbid"", type text}, {""Library Name"", type text}, {""Season Number"", type text}, {""Episodes"", type text}, {""Title"", type text}, {""PlexTitleCardUrls"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""

    With wsPlexEpisodeExport.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=PlexEpisodeExport;Extended Properties=""""", Destination:=wsPlexEpisodeExport.Range("$A$1")).QueryTable
        .CommandType = xlCmdSql
        .CommandText = Array("SELECT * FROM [PlexEpisodeExport]")
        .RowNumbers = False
        .FillAdjacentFormulas = False
        .PreserveFormatting = True
        .RefreshOnFileOpen = False
        .BackgroundQuery = True
        .RefreshStyle = xlInsertDeleteCells
        .SavePassword = False
        .SaveData = True
        .AdjustColumnWidth = True
        .RefreshPeriod = 0
        .PreserveColumnInfo = True
        .ListObject.DisplayName = "PlexEpisodeExport"
        .Refresh BackgroundQuery:=False
        .ListObject.ShowTotals = True
    End With
    
    Set wsSheet = ThisWorkbook.Sheets("PlexEpisodeExport")
    Set rngURLs = wsSheet.UsedRange
    ConvertToClickableLinks wsSheet, rngURLs
       
    ' Refresh_All
    Refresh_All_Data_Connections
    
    ' Select "PPM"
    ThisWorkbook.Sheets("PPM").Activate
End Sub

Sub Refresh_All_Data_Connections()
    Dim bBackground
    Dim objConnection
    
    For Each objConnection In ThisWorkbook.Connections
        'Get current background-refresh value
        bBackground = objConnection.OLEDBConnection.BackgroundQuery
        
        'Temporarily disable background-refresh
        objConnection.OLEDBConnection.BackgroundQuery = False
        
        'Refresh this connection
        objConnection.Refresh
        
        'Set background-refresh value back to original value
        objConnection.OLEDBConnection.BackgroundQuery = bBackground
    Next
    
    MsgBox "Finished refreshing all data connections", vbInformation
    
End Sub
Sub CheckForUpdate(currentVersion As String)
    Dim http As Object
    Dim url As String
    Dim onlineVersion As String
    Dim fileContent As String
    
    ' Define the URL of the GitHub raw file
    url = "https://github.com/fscorrupt/Plex-Poster-Maker/raw/main/ReleaseModule.txt"
    
    ' Create a new WinHttpRequest object
    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    
    ' Open a connection to the URL
    http.Open "GET", url, False
    
    ' Send the request for the file content
    http.send
    
    ' Check if the request was successful
    If http.Status = 200 Then
        ' Get the content of the file
        fileContent = http.responseText
        
        ' Extract the online version from the file content
        ' (Assuming the file content contains only the version number)
        onlineVersion = Trim(fileContent)
        
        ' Compare the current version with the online version
        If currentVersion <> onlineVersion Then
            ' Display a message box prompting the user to update
            MsgBox "Module1.bas check" & vbCrLf & "Your version:(" & currentVersion & ")." & vbCrLf & "Version Available: (" & onlineVersion & ")." & vbCrLf & "Please update. Aborting now...", vbExclamation
            End
        End If
    Else
        ' Display a message box if the request fails
        MsgBox "Failed to check for updates. Please try again later.", vbExclamation
    End If
    
    ' Clean up the HTTP object
    Set http = Nothing
End Sub

Function GetFolderPath(prompt As String) As String
    Dim dialog As FileDialog
    Dim selectedFolder As Variant
    
    #If Mac Then
        ' For macOS, use the MacScript function to call a shell script
        Dim shellScript As String
        shellScript = "osascript -e 'tell application ""System Events"" to activate' -e 'return POSIX path of (choose folder with prompt """ & prompt & """)'"
        
        selectedFolder = MacScript(shellScript)
        
        ' Check if user canceled the dialog
        If selectedFolder <> "" Then
            GetFolderPath = selectedFolder
        Else
            GetFolderPath = ""
        End If
    #Else
        ' For Windows, use the FileDialog object
        Set dialog = Application.FileDialog(msoFileDialogFolderPicker)
        
        ' Set dialog properties
        dialog.Title = prompt
        dialog.AllowMultiSelect = False
        
        ' Set initial directory to the current directory of the Excel file
        dialog.InitialFileName = ThisWorkbook.Path
        
        ' Show the dialog and check if a folder is selected
        If dialog.Show = -1 Then
            ' Get the selected folder path
            selectedFolder = dialog.SelectedItems(1)
            GetFolderPath = selectedFolder
        Else
            GetFolderPath = ""
        End If
    #End If
End Function

Function ValidateFilenames(Filename1 As String, Filename2 As String, Filename3 As String) As Boolean
    ' Check if the files exist
    If Len(Dir(Filename1)) = 0 Then
        MsgBox "File '" & Filename1 & "' does not exist. Did you specify the PPM Logs folder? Try again...", vbExclamation, "File Not Found"
        ValidateFilenames = False
        Exit Function
    End If
    
    If Len(Dir(Filename2)) = 0 Then
        MsgBox "File '" & Filename2 & "' does not exist. Did you specify the PPM Logs folder? Try again...", vbExclamation, "File Not Found"
        ValidateFilenames = False
        Exit Function
    End If
    
    If Len(Dir(Filename3)) = 0 Then
        MsgBox "File '" & Filename3 & "' does not exist. Did you specify the PPM Logs folder? Try again...", vbExclamation, "File Not Found"
        ValidateFilenames = False
        Exit Function
    End If
    
    ' All files exist
    ValidateFilenames = True
End Function

Sub AddOrUpdateFancyButtonToPPM()
    Dim shp As Shape
    Dim rng As Range
    Dim btnText As String
    Dim btnExists As Boolean
    
    ' Define the range where you want to place the button
    Set rng = ThisWorkbook.Sheets("PPM").Range("C10")
    
    ' Set button text
    btnText = "Import CSVs"
    
    ' Check if the button already exists
    For Each shp In ThisWorkbook.Sheets("PPM").Shapes
        If shp.Name = "FancyButton" Then
            ' Button already exists, delete it
            shp.Delete
            Exit For
        End If
    Next shp
    
    ' Add a rounded rectangle shape to the worksheet
    Set shp = ThisWorkbook.Sheets("PPM").Shapes.AddShape(msoShapeRoundedRectangle, rng.Left, rng.Top, 215.25, 66.75)
    
    ' Configure the shape
    With shp
        .Name = "FancyButton" ' Change the name of the shape as needed
        .TextFrame.Characters.Text = btnText ' Set button text
        .TextFrame.HorizontalAlignment = xlHAlignCenter ' Center-align text
        .TextFrame.VerticalAlignment = xlVAlignCenter ' Center-align text
        .TextFrame.Characters.Font.Size = 24 ' Set font size
        .Line.Visible = msoFalse ' Hide outline
        .OnAction = "PromptUser" ' Assign the macro to be executed when the button is clicked
        
        ' Apply 3D effects
        With .ThreeD
            .SetPresetCamera (msoCameraOrthographicFront)
            .RotationX = 0
            .RotationY = 0
            .RotationZ = 0
            .FieldOfView = 0
            .LightAngle = 25
            .PresetLighting = msoLightRigContrasting
            .PresetMaterial = msoMaterialMetal2
            .Depth = 0
            .ContourWidth = 0
            .BevelTopType = msoBevelCircle
            .BevelTopInset = 7
            .BevelTopDepth = 7
            .BevelBottomType = msoBevelNone
        End With
        ' Apply shadow
        With .Shadow
            .Type = msoShadow25
            .Visible = msoTrue
            .Style = msoShadowStyleOuterShadow
            .Blur = 11.81
            .OffsetX = -15.3097754407
            .OffsetY = 12.3976117037
            .RotateWithShape = msoTrue
            .ForeColor.RGB = RGB(0, 0, 0)
            .Transparency = 0.7200000286
            .Size = 100
        End With
    End With
End Sub

Sub KeepOnlyPPMSheet()
    Dim ws As Worksheet
    Dim tempSheet As Worksheet
    
    ' Create a new sheet named "ppm_temp_sheet1"
    Set tempSheet = ThisWorkbook.Sheets.Add
    tempSheet.Name = "ppm_temp_sheet1"
    
    Application.DisplayAlerts = False ' Disable alerts
    
    ' Delete all sheets except the "ppm_temp_sheet1"
    For Each ws In ThisWorkbook.Worksheets
        If ws.Name <> tempSheet.Name Then
            ws.Delete
        End If
    Next ws
    
    ' Rename the "ppm_temp_sheet1" to "PPM"
    tempSheet.Name = "PPM"
    
    Application.DisplayAlerts = True ' Re-enable alerts
End Sub

Sub RemoveDocumentPersonalInfo()
    Dim prop As DocumentProperty
    
    ' Remove personal information from document properties
    For Each prop In ThisWorkbook.CustomDocumentProperties
        If prop.Name Like "Author" Or prop.Name Like "Last Save By" Or prop.Name Like "Manager" Or prop.Name Like "Company" Then
            prop.Delete
        End If
    Next prop
    
    ' Remove personal information from built-in document properties
    ThisWorkbook.BuiltinDocumentProperties("Last Author").Value = ""
    ThisWorkbook.BuiltinDocumentProperties("Author").Value = ""
    ThisWorkbook.BuiltinDocumentProperties("Manager").Value = ""
    ThisWorkbook.BuiltinDocumentProperties("Company").Value = ""
    
    ' Clear personal information from the file properties
    ' ThisWorkbook.RemoveDocumentInformation (XlRemoveDocInfoType.xlAuthor)
    ' ThisWorkbook.RemoveDocumentInformation (XlRemoveDocInfoType.xlLastAuthor)
    ' ThisWorkbook.RemoveDocumentInformation (XlRemoveDocInfoType.xlComments)
    ' ThisWorkbook.RemoveDocumentInformation (XlRemoveDocInfoType.xlCompanyName)
    ' ThisWorkbook.RemoveDocumentInformation (XlRemoveDocInfoType.xlManager)
End Sub
