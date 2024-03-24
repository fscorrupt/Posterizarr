Attribute VB_Name = "Module1"
Option Explicit
Sub PromptUser()
    Dim folderPath As String
     
    ' Prompt the user to select a folder
    KeepOnlyPPMSheet
    
    ' Prompt the user to select a folder
    AddOrUpdateFancyButtonToPPM
    
    ' Prompt the user to select a folder
    folderPath = GetFolderPath("Select the folder containing the PPM log files")
    
    ' Check if a folder is selected
    If folderPath <> "" Then
        ' Call the macro with the folder path
        ImportCSVs folderPath
    Else
        MsgBox "No folder selected. Operation canceled."
    End If
    ' Remove info to retain privacy
    RemoveDocumentPersonalInfo
End Sub

Sub ImportCSVs(folderPath)

    Dim Filename1 As String
    Dim Filename2 As String
    Dim Filename3 As String
    Dim Filename4 As String
    Dim conn As WorkbookConnection
    Dim q
    Dim ws As Worksheet
    
    ' Concatenate folder path with filenames
    Filename1 = folderPath & "\ImageChoices.csv"
    Filename2 = folderPath & "\PlexLibexport.csv"
    Filename3 = folderPath & "\PlexEpisodeExport.csv"
    Filename4 = ThisWorkbook.FullName
    
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
    
    ThisWorkbook.Queries.Add Name:="ImageChoices", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & "    Source = Csv.Document(File.Contents(""" & Filename1 & """),[Delimiter="";"", Columns=8, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Title"", type text}, {""Type"", t" & _
        "ype text}, {""Rootfolder"", type text}, {""LibraryName"", type text}, {""Textless"", type logical}, {""Fallback"", type logical}, {""TextTruncated"", type logical}, {""Url"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""
    ThisWorkbook.Worksheets.Add
    With ActiveSheet.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=ImageChoices;Extended Properties=""""" _
        , Destination:=Range("$A$1")).QueryTable
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
    End With
    ActiveSheet.ListObjects("ImageChoices").ShowTotals = True
    ' After creating each worksheet, rename it
    ActiveSheet.Name = "ImageChoices"

    ThisWorkbook.Queries.Add Name:="PlexLibexport", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & "    Source = Csv.Document(File.Contents(""" & Filename2 & """),[Delimiter="";"", Columns=18, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Library Name"", type text}, {""" & _
        "Library Type"", type text}, {""title"", type text}, {""originalTitle"", type text}, {""SeasonNames"", type text}, {""SeasonNumbers"", type number}, {""SeasonRatingKeys"", type number}, {""year"", Int64.Type}, {""tvdbid"", Int64.Type}, {""imdbid"", type text}, {""tmdbid"", Int64.Type}, {""ratingKey"", Int64.Type}, {""Path"", type text}, {""RootFoldername"", type text" & _
        "}, {""MultipleVersions"", type logical}, {""PlexPosterUrl"", type text}, {""PlexBackgroundUrl"", type text}, {""PlexSeasonUrls"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""
    ThisWorkbook.Worksheets.Add
    With ActiveSheet.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=PlexLibexport;Extended Properties=""""" _
        , Destination:=Range("$A$1")).QueryTable
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
    End With
    ActiveSheet.ListObjects("PlexLibexport").ShowTotals = True
    ' After creating each worksheet, rename it
    ActiveSheet.Name = "PlexLibexport"

    ThisWorkbook.Queries.Add Name:="PlexEpisodeExport", Formula:= _
        "let" & Chr(13) & "" & Chr(10) & "    Source = Csv.Document(File.Contents(""" & Filename3 & """),[Delimiter="";"", Columns=8, Encoding=65001, QuoteStyle=QuoteStyle.None])," & Chr(13) & "" & Chr(10) & "    #""Promoted Headers"" = Table.PromoteHeaders(Source, [PromoteAllScalars=true])," & Chr(13) & "" & Chr(10) & "    #""Changed Type"" = Table.TransformColumnTypes(#""Promoted Headers"",{{""Show Name"", type text}, {""" & _
        "Type"", type text}, {""tvdbid"", Int64.Type}, {""tmdbid"", Int64.Type}, {""Season Number"", Int64.Type}, {""Episodes"", type number}, {""Title"", type text}, {""PlexTitleCardUrls"", type text}})" & Chr(13) & "" & Chr(10) & "in" & Chr(13) & "" & Chr(10) & "    #""Changed Type"""
    ThisWorkbook.Worksheets.Add
    With ActiveSheet.ListObjects.Add(SourceType:=0, Source:= _
        "OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=PlexEpisodeExport;Extended Properties=""""" _
        , Destination:=Range("$A$1")).QueryTable
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
    End With
    ActiveSheet.ListObjects("PlexEpisodeExport").ShowTotals = True
    ' After creating each worksheet, rename it
    ActiveSheet.Name = "PlexEpisodeExport"
    
    ' Refresh_All
    Refresh_All_Data_Connections
    
    ' Select "PPM"
    ThisWorkbook.Sheets("PPM").Activate
    
    ' Remove personal info and save the workbook without prompting
    RemoveDocumentPersonalInfo
    Application.DisplayAlerts = False ' Disable alerts
    ThisWorkbook.SaveAs Filename:=Filename4, FileFormat:=xlOpenXMLWorkbookMacroEnabled, CreateBackup:=False
    Application.DisplayAlerts = True ' Re-enable alerts
    MsgBox "Workbook saved successfully."
    
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
    
    MsgBox "Finished refreshing all data connections"
    
End Sub

Function GetFolderPath(prompt As String) As String
    Dim dialog As FileDialog
    Dim selectedFolder As Variant
    
    ' Create a FileDialog object
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
End Function
Function ValidateFilenames(Filename1 As String, Filename2 As String, Filename3 As String) As Boolean
    ' Check if the files exist
    If Len(Dir(Filename1)) = 0 Then
        MsgBox "File '" & Filename1 & "' does not exist. Did you specify the PPM Logs folder? Aborting...", vbExclamation, "File Not Found"
        ValidateFilenames = False
        Exit Function
    End If
    
    If Len(Dir(Filename2)) = 0 Then
        MsgBox "File '" & Filename2 & "' does not exist. Did you specify the PPM Logs folder? Aborting...", vbExclamation, "File Not Found"
        ValidateFilenames = False
        Exit Function
    End If
    
    If Len(Dir(Filename3)) = 0 Then
        MsgBox "File '" & Filename3 & "' does not exist. Did you specify the PPM Logs folder? Aborting...", vbExclamation, "File Not Found"
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
