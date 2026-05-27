using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MaitaCOEIROINK.Models;
using MaitaCOEIROINK.Services;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Storage;
using Windows.Storage.Pickers;
using WinRT.Interop;

namespace MaitaCOEIROINK.ViewModels;

public sealed partial class MainViewModel : ObservableObject, IDisposable
{
    private readonly LocalStorageService _storage = new();
    private readonly CoeiroinkService _coeiroink = new();
    private readonly DispatcherQueue _dispatcher;
    private readonly MediaPlayer _mediaPlayer = new();
    private readonly DispatcherTimer _saveTimer;
    private readonly DispatcherTimer _prosodyTimer;
    private readonly DispatcherTimer _kanaTimer;

    private List<Project> _projects = [];
    private List<SentenceRange> _lastSentenceRanges = [];
    private List<DictionaryEntry> _dictionaryEntries = [];
    private string? _activeId;
    private string? _activeSentenceKey;
    private bool _isTitleEditing;
    private CancellationTokenSource? _playbackCts;

    public MainViewModel(DispatcherQueue dispatcher)
    {
        _dispatcher = dispatcher;
        _saveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(320) };
        _saveTimer.Tick += (_, _) => _ = PersistProjectsAsync();
        _prosodyTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(420) };
        _prosodyTimer.Tick += (_, _) => _ = ScheduleProsodyFetchAsync();
        _kanaTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(420) };
        _kanaTimer.Tick += (_, _) => _ = ReestimateKanaAsync();
        _mediaPlayer.MediaEnded += (_, _) => SetPlaybackUi(false);
    }

    public ObservableCollection<ProjectListItem> ProjectItems { get; } = [];
    public ObservableCollection<MoraSpanUi> MoraSpans { get; } = [];
    public ObservableCollection<MoraUiCell> MoraCells { get; } = [];

    [ObservableProperty] private string _editorText = "";
    [ObservableProperty] private string _projectTitle = "無題";
    [ObservableProperty] private string _titleEditText = "無題";
    [ObservableProperty] private bool _isTitleEditVisible;
    [ObservableProperty] private bool _isParamPaneVisible;
    [ObservableProperty] private bool _isIntonationVisible;
    [ObservableProperty] private bool _isPlaying;
    [ObservableProperty] private string _toastMessage = "";
    [ObservableProperty] private bool _isToastVisible;
    [ObservableProperty] private int _exportSamplingRate = AppConstants.ExportSampleRateDefault;
    [ObservableProperty] private bool _isBusy;

    [ObservableProperty] private double _speedScale = 1;
    [ObservableProperty] private double _pitchScale;
    [ObservableProperty] private double _intonationScale = 1;
    [ObservableProperty] private double _volumeScale = 1;
    [ObservableProperty] private double _prePhonemeLength = 0.1;
    [ObservableProperty] private double _postPhonemeLength = 0.1;
    [ObservableProperty] private string _processingAlgorithm = "td-psola";

    public string SpeedScaleLabel => SpeedScale.ToString("0.00");
    public string PitchScaleLabel => PitchScale.ToString("0.00");
    public string IntonationScaleLabel => IntonationScale.ToString("0.00");
    public string VolumeScaleLabel => VolumeScale.ToString("0.00");
    public string PrePhonemeLabel => PrePhonemeLength.ToString("0.00");
    public string PostPhonemeLabel => PostPhonemeLength.ToString("0.00");

    public List<int> SampleRateOptions { get; } = AppConstants.SampleRateOptions.ToList();
    public List<string> ProcessingAlgorithms { get; } = ["td-psola", "world", "resampling"];

    public int ExportSamplingRateIndex
    {
        get
        {
            var idx = Array.IndexOf(AppConstants.SampleRateOptions, ExportSamplingRate);
            return idx >= 0 ? idx : Array.IndexOf(AppConstants.SampleRateOptions, AppConstants.ExportSampleRateDefault);
        }
        set
        {
            if (value < 0 || value >= AppConstants.SampleRateOptions.Length) return;
            ExportSamplingRate = AppConstants.SampleRateOptions[value];
        }
    }

    public async Task InitializeAsync()
    {
        _dictionaryEntries = await _storage.LoadDictionaryAsync();
        try
        {
            await _coeiroink.SyncDictionaryAsync(_dictionaryEntries);
        }
        catch
        {
            /* COEIROINK 未起動 */
        }

        var settings = await _storage.LoadAppSettingsAsync();
        ExportSamplingRate = settings.ExportSamplingRate;
        var blob = await _storage.LoadProjectsAsync();
        _projects = blob.Projects;
        MigrateProjects(_projects);
        if (_projects.Count == 0)
        {
            _projects.Add(CreateBlankProject());
        }

        _activeId = blob.ActiveId is not null && _projects.Any(p => p.Id == blob.ActiveId)
            ? blob.ActiveId
            : _projects[0].Id;
        ApplyProjectSelection(_activeId);
    }

    public void ApplyEditorTextChange(string text)
    {
        EditorText = text;
        var project = ActiveProject;
        if (project == null) return;
        SaveActiveSegmentParams();
        project.Text = text;
        SyncTitleFromTextIfAuto(project);
        ProjectTitle = project.Title;
        RefreshProjectList();
        UpdateSegmentMirror();
        SchedulePersist();
    }

    public void OnEditorSelectionChanged(int caretIndex)
    {
        var ranges = SegmentParser.SentenceRangesFromText(EditorText);
        var found = SegmentParser.FindRangeAtCursor(caretIndex, ranges);
        if (found != null)
        {
            if (found.Key != _activeSentenceKey) SelectSentence(found.Key);
            return;
        }

        if (_activeSentenceKey != null) ClearSentenceSelection();
    }

    partial void OnSpeedScaleChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(SpeedScaleLabel));
    }

    partial void OnPitchScaleChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(PitchScaleLabel));
    }

    partial void OnIntonationScaleChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(IntonationScaleLabel));
    }

    partial void OnVolumeScaleChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(VolumeScaleLabel));
    }

    partial void OnPrePhonemeLengthChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(PrePhonemeLabel));
    }

    partial void OnPostPhonemeLengthChanged(double value)
    {
        OnParamChanged();
        OnPropertyChanged(nameof(PostPhonemeLabel));
    }

    partial void OnProcessingAlgorithmChanged(string value) => OnParamChanged();

    partial void OnExportSamplingRateChanged(int value)
    {
        OnPropertyChanged(nameof(ExportSamplingRateIndex));
        _ = PersistAppSettingsAsync();
    }

    private void OnParamChanged()
    {
        if (_activeSentenceKey == null) return;
        SaveActiveSegmentParams();
        UpdateSegmentMirror();
    }

    [RelayCommand]
    private void NewProject()
    {
        SaveActiveSegmentParams();
        SyncActiveProjectFromUi();
        var p = CreateBlankProject();
        _projects.Insert(0, p);
        _activeId = p.Id;
        ApplyProjectSelection(p.Id);
        SchedulePersist();
    }

    [RelayCommand]
    private async Task DeleteProjectAsync(string? id)
    {
        if (string.IsNullOrEmpty(id)) return;
        if (_projects.Count <= 1)
        {
            ShowToast("最後のプロジェクトは削除できません");
            return;
        }

        var dialog = new ContentDialog
        {
            Title = "プロジェクトを削除",
            Content = "このプロジェクトを削除しますか？",
            PrimaryButtonText = "削除",
            CloseButtonText = "キャンセル",
            DefaultButton = ContentDialogButton.Close,
            XamlRoot = App.MainWindowContent.XamlRoot,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary) return;

        var wasActive = _activeId == id;
        _projects.RemoveAll(p => p.Id == id);
        if (wasActive)
        {
            _activeId = _projects[0].Id;
            ApplyProjectSelection(_activeId);
        }
        else
        {
            RefreshProjectList();
            await PersistProjectsAsync();
        }
    }

    [RelayCommand]
    private void DismissSentenceSelection() => ClearSentenceSelection();

    [RelayCommand]
    private void SelectProject(string? id)
    {
        if (string.IsNullOrEmpty(id) || id == _activeId) return;
        SaveActiveSegmentParams();
        SyncActiveProjectFromUi();
        ApplyProjectSelection(id);
        SchedulePersist();
    }

    [RelayCommand]
    private void BeginTitleEdit()
    {
        TitleEditText = ProjectTitle;
        IsTitleEditVisible = true;
    }

    [RelayCommand]
    private void CommitTitleEdit()
    {
        if (!IsTitleEditVisible) return;
        var project = ActiveProject;
        if (project == null) return;
        project.Title = string.IsNullOrWhiteSpace(TitleEditText) ? "無題" : TitleEditText.Trim();
        project.TitleEdited = true;
        ProjectTitle = project.Title;
        IsTitleEditVisible = false;
        RefreshProjectList();
        BumpUpdatedAt();
        SchedulePersist();
    }

    [RelayCommand]
    private void CancelTitleEdit()
    {
        IsTitleEditVisible = false;
        ProjectTitle = ActiveProject?.Title ?? "無題";
    }

    [RelayCommand]
    private async Task TogglePlaybackAsync()
    {
        if (IsPlaying)
        {
            StopPlayback();
            return;
        }

        await PlayAllAsync();
    }

    [RelayCommand]
    private async Task ExportAllAsync()
    {
        await ExportInternalAsync(fullDocument: true);
    }

    [RelayCommand]
    private async Task ExportActiveSentenceAsync()
    {
        if (_activeSentenceKey == null)
        {
            ShowToast("書き出す文章を選択してください");
            return;
        }

        await ExportInternalAsync(fullDocument: false);
    }

    [RelayCommand]
    private void ResetSegmentParams()
    {
        if (_activeSentenceKey == null) return;
        var project = ActiveProject;
        if (project == null) return;
        project.SentenceParamsByKey.Remove(_activeSentenceKey);
        project.SentenceProsodyByKey.Remove(_activeSentenceKey);
        LoadSegmentParamsToUi();
        var range = SegmentParser.SentenceRangesFromText(EditorText).FirstOrDefault(r => r.Key == _activeSentenceKey);
        if (range != null) _ = EnsureProsodyAsync(project, _activeSentenceKey, range.Text, force: true);
        BumpUpdatedAt();
        SchedulePersist();
        UpdateSegmentMirror();
        RefreshIntonationUi();
    }

    [RelayCommand]
    private async Task RegenerateProsodyAsync()
    {
        if (_activeSentenceKey == null) return;
        var project = ActiveProject;
        if (project == null) return;
        var range = SegmentParser.SentenceRangesFromText(EditorText).FirstOrDefault(r => r.Key == _activeSentenceKey);
        if (range == null) return;
        IsBusy = true;
        try
        {
            await EnsureProsodyAsync(project, _activeSentenceKey, range.Text, force: true);
            RefreshIntonationUi();
        }
        catch (Exception ex)
        {
            ShowToast(ex.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task OpenDictionaryAsync()
    {
        var dialog = new DictionaryDialog(_dictionaryEntries);
        dialog.XamlRoot = App.MainWindowContent.XamlRoot;
        var result = await dialog.ShowAsync();
        if (result != ContentDialogResult.Primary) return;
        try
        {
            _dictionaryEntries = dialog.GetEntries();
            await _coeiroink.SyncDictionaryAsync(_dictionaryEntries);
            await _storage.SaveDictionaryAsync(_dictionaryEntries);
            ShowToast("辞書を保存しました");
        }
        catch (Exception ex)
        {
            ShowToast(ex.Message);
        }
    }

    public void ScheduleKanaReestimate()
    {
        _kanaTimer.Stop();
        _kanaTimer.Start();
    }

    public void SetMoraPitch(SegmentMora mora, double pitch)
    {
        mora.Pitch = Math.Clamp(pitch, AppConstants.MoraPitchMin, AppConstants.MoraPitchMax);
        foreach (var cell in MoraCells.Where(c => ReferenceEquals(c.Mora, mora)))
        {
            cell.Pitch = mora.GetPitch();
        }

        BumpUpdatedAt();
        SchedulePersist();
    }

    public void UpdateMoraHira(MoraSpanUi span, string next)
    {
        var normalized = next.Normalize(System.Text.NormalizationForm.FormKC).Trim();
        if (normalized.Length == 0) return;
        if (normalized == span.Mora.Hira) return;
        span.Mora.Hira = normalized;
        span.Hira = normalized;
        BumpUpdatedAt();
        ScheduleKanaReestimate();
    }

    public void BuildSegmentMirror(TextBlock mirror)
    {
        mirror.Inlines.Clear();
        var project = ActiveProject;
        var text = EditorText;
        if (string.IsNullOrEmpty(text)) return;
        var ranges = SegmentParser.SentenceRangesFromText(text);
        var cursor = 0;
        foreach (var r in ranges)
        {
            if (cursor < r.Start)
            {
                mirror.Inlines.Add(new Microsoft.UI.Xaml.Documents.Run { Text = text[cursor..r.Start] });
            }

            var run = new Microsoft.UI.Xaml.Documents.Run { Text = text[r.Start..r.End] };
            if (_activeSentenceKey == r.Key)
            {
                run.Foreground = Application.Current.Resources["AccentFillColorDefaultBrush"] as Brush;
                run.FontWeight = Microsoft.UI.Text.FontWeights.SemiBold;
            }
            else if (SegmentParser.HasCustomSentenceParams(project, r.Key))
            {
                run.Foreground = Application.Current.Resources["TextFillColorSecondaryBrush"] as Brush;
            }

            mirror.Inlines.Add(run);
            cursor = r.End;
        }

        if (cursor < text.Length)
        {
            mirror.Inlines.Add(new Microsoft.UI.Xaml.Documents.Run { Text = text[cursor..] });
        }
    }

    private Project? ActiveProject => _projects.FirstOrDefault(p => p.Id == _activeId);

    private static Project CreateBlankProject() => new()
    {
        Id = Guid.NewGuid().ToString(),
        Title = "無題",
        Text = "",
        Params = ParamDefaults.Create(),
        UpdatedAt = DateTime.UtcNow.ToString("o"),
    };

    private void ApplyProjectSelection(string id)
    {
        if (_activeId != id) SaveActiveSegmentParams();
        _activeId = id;
        _activeSentenceKey = null;
        _lastSentenceRanges.Clear();
        var project = ActiveProject;
        if (project == null) return;
        EditorText = project.Text;
        ProjectTitle = project.Title;
        IsTitleEditVisible = false;
        IsParamPaneVisible = false;
        IsIntonationVisible = false;
        RefreshProjectList();
        UpdateSegmentMirror();
        ScheduleProsodyFetch();
    }

    private void SelectSentence(string key)
    {
        if (_activeSentenceKey != null && _activeSentenceKey != key) SaveActiveSegmentParams();
        _activeSentenceKey = key;
        LoadSegmentParamsToUi();
        IsParamPaneVisible = true;
        IsIntonationVisible = true;
        RefreshIntonationUi();
        var project = ActiveProject;
        var range = SegmentParser.SentenceRangesFromText(EditorText).FirstOrDefault(r => r.Key == key);
        if (project != null && range != null)
        {
            _ = EnsureProsodyAsync(project, key, range.Text, force: false);
        }

        UpdateSegmentMirror();
    }

    private void ClearSentenceSelection()
    {
        SaveActiveSegmentParams();
        _activeSentenceKey = null;
        IsParamPaneVisible = false;
        IsIntonationVisible = false;
        MoraSpans.Clear();
        MoraCells.Clear();
        UpdateSegmentMirror();
    }

    private void LoadSegmentParamsToUi()
    {
        var project = ActiveProject;
        if (project == null || _activeSentenceKey == null) return;
        var p = SegmentParser.GetSentenceParams(project, _activeSentenceKey);
        SpeedScale = p.SpeedScale;
        PitchScale = p.PitchScale;
        IntonationScale = p.IntonationScale;
        VolumeScale = p.VolumeScale;
        PrePhonemeLength = p.PrePhonemeLength;
        PostPhonemeLength = p.PostPhonemeLength;
        ProcessingAlgorithm = p.ProcessingAlgorithm;
    }

    private void SaveActiveSegmentParams()
    {
        if (_activeSentenceKey == null) return;
        var project = ActiveProject;
        if (project == null) return;
        var saved = SnapshotParamsFromUi();
        var baseline = project.Params.Clone();
        if (saved.Equals(baseline))
        {
            project.SentenceParamsByKey.Remove(_activeSentenceKey);
        }
        else
        {
            project.SentenceParamsByKey[_activeSentenceKey] = saved;
        }

        BumpUpdatedAt();
        SchedulePersist();
    }

    private ParamSet SnapshotParamsFromUi() => new()
    {
        SpeedScale = SpeedScale,
        PitchScale = PitchScale,
        IntonationScale = IntonationScale,
        VolumeScale = VolumeScale,
        PrePhonemeLength = PrePhonemeLength,
        PostPhonemeLength = PostPhonemeLength,
        ProcessingAlgorithm = ProcessingAlgorithm,
    };

    private void SyncActiveProjectFromUi()
    {
        var project = ActiveProject;
        if (project == null) return;
        SaveActiveSegmentParams();
        project.Text = EditorText;
        SyncTitleFromTextIfAuto(project);
        ProjectTitle = project.Title;
        RefreshProjectList();
        UpdateSegmentMirror();
    }

    private static void SyncTitleFromTextIfAuto(Project project)
    {
        if (project.TitleEdited) return;
        project.Title = LocalStorageService.DeriveDefaultTitle(project.Text);
    }

    private void RefreshProjectList()
    {
        ProjectItems.Clear();
        foreach (var p in _projects.OrderByDescending(x => DateTime.Parse(x.UpdatedAt, null, System.Globalization.DateTimeStyles.RoundtripKind)))
        {
            ProjectItems.Add(new ProjectListItem
            {
                Project = p,
                UpdatedLabel = LocalStorageService.FormatUpdatedLabel(p.UpdatedAt),
                IsActive = p.Id == _activeId,
            });
        }
    }

    private void UpdateSegmentMirror() => SegmentMirrorChanged?.Invoke(this, EventArgs.Empty);

    public event EventHandler? SegmentMirrorChanged;

    private void RefreshIntonationUi()
    {
        MoraSpans.Clear();
        MoraCells.Clear();
        var project = ActiveProject;
        if (project == null || _activeSentenceKey == null) return;
        if (!project.SentenceProsodyByKey.TryGetValue(_activeSentenceKey, out var entry) || entry.Detail.Count == 0) return;
        foreach (var span in CoeiroinkService.BuildMoraSpans(entry.Detail)) MoraSpans.Add(span);
        foreach (var cell in CoeiroinkService.BuildHiraganaCells(entry.Detail)) MoraCells.Add(cell);
    }

    private void SchedulePersist()
    {
        _saveTimer.Stop();
        _saveTimer.Start();
    }

    private async Task PersistProjectsAsync()
    {
        _saveTimer.Stop();
        SyncActiveProjectFromUi();
        await _storage.SaveProjectsAsync(new ProjectsBlob { Projects = _projects, ActiveId = _activeId });
    }

    private async Task PersistAppSettingsAsync()
    {
        await _storage.SaveAppSettingsAsync(new AppSettings { ExportSamplingRate = ExportSamplingRate });
    }

    private void ScheduleProsodyFetch()
    {
        _prosodyTimer.Stop();
        _prosodyTimer.Start();
    }

    private async Task ScheduleProsodyFetchAsync()
    {
        _prosodyTimer.Stop();
        var project = ActiveProject;
        if (project == null) return;
        var ranges = SegmentParser.SentenceRangesFromText(EditorText);
        if (_lastSentenceRanges.Count > 0)
        {
            SegmentParser.RemapSentenceParams(project, _lastSentenceRanges, ranges);
            SegmentParser.RemapSentenceProsody(project, _lastSentenceRanges, ranges);
        }

        _lastSentenceRanges = ranges;
        foreach (var r in ranges)
        {
            if (!project.SentenceProsodyByKey.TryGetValue(r.Key, out var entry) || entry.Text != r.Text)
            {
                try
                {
                    await EnsureProsodyAsync(project, r.Key, r.Text, force: false);
                }
                catch
                {
                    /* バックグラウンド推定失敗は無視 */
                }
            }
        }

        if (_activeSentenceKey != null) RefreshIntonationUi();
    }

    private async Task EnsureProsodyAsync(Project project, string key, string text, bool force)
    {
        await _coeiroink.EnsureSegmentProsodyAsync(project, key, text, force);
        if (_activeSentenceKey == key) RefreshIntonationUi();
        SchedulePersist();
    }

    private async Task ReestimateKanaAsync()
    {
        _kanaTimer.Stop();
        var project = ActiveProject;
        if (project == null || _activeSentenceKey == null) return;
        try
        {
            await _coeiroink.ReestimateProsodyFromKanaAsync(project, _activeSentenceKey);
            RefreshIntonationUi();
            SchedulePersist();
        }
        catch (Exception ex)
        {
            ShowToast(ex.Message);
        }
    }

    private async Task PlayAllAsync()
    {
        IsBusy = true;
        try
        {
            StopPlayback();
            SaveActiveSegmentParams();
            var project = ActiveProject ?? throw new InvalidOperationException("プロジェクトがありません");
            var buf = await _coeiroink.BuildFullUtteranceAsync(project, EditorText, AppConstants.PlaybackSampleRate);
            await PlayBufferAsync(buf);
            SetPlaybackUi(true);
        }
        catch (Exception ex)
        {
            StopPlayback();
            ShowToast(ex.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task ExportInternalAsync(bool fullDocument)
    {
        IsBusy = true;
        try
        {
            await PersistAppSettingsAsync();
            SaveActiveSegmentParams();
            var project = ActiveProject ?? throw new InvalidOperationException("プロジェクトがありません");
            byte[] buf;
            string defaultName;
            if (fullDocument)
            {
                buf = await _coeiroink.BuildFullUtteranceAsync(project, EditorText, ExportSamplingRate);
                defaultName = $"{SafeName(project.Title)}.wav";
            }
            else
            {
                var range = SegmentParser.SentenceRangesFromText(EditorText).FirstOrDefault(r => r.Key == _activeSentenceKey)
                    ?? throw new InvalidOperationException("選択した文章が見つかりません");
                project.SentenceProsodyByKey.TryGetValue(range.Key, out var prosody);
                if (prosody == null || prosody.Text != range.Text.Trim())
                {
                    await EnsureProsodyAsync(project, range.Key, range.Text, false);
                    project.SentenceProsodyByKey.TryGetValue(range.Key, out prosody);
                }

                var parameters = SegmentParser.GetSentenceParams(project, range.Key);
                buf = await _coeiroink.SynthesizeLineAsync(range.Text, parameters, prosody, ExportSamplingRate);
                var snippet = SafeName(range.Text, 24);
                defaultName = $"{SafeName(project.Title)}_{snippet}.wav";
            }

            var picker = new FileSavePicker
            {
                SuggestedStartLocation = PickerLocationId.MusicLibrary,
                SuggestedFileName = defaultName,
                FileTypeChoices = { { "WAV", [".wav"] } },
            };
            var hwnd = WindowNative.GetWindowHandle(App.MainWindow);
            InitializeWithWindow.Initialize(picker, hwnd);
            var file = await picker.PickSaveFileAsync();
            if (file == null) return;
            await FileIO.WriteBytesAsync(file, buf);
            ShowToast($"書き出しました: {file.Path}");
        }
        catch (Exception ex)
        {
            ShowToast(ex.Message);
        }
        finally
        {
            IsBusy = false;
        }
    }

    private async Task PlayBufferAsync(byte[] buf)
    {
        var temp = await StorageFolder.CreateFileAsync(
            $"maita-playback-{Guid.NewGuid():N}.wav",
            CreationCollisionOption.ReplaceExisting,
            StorageFolder.ApplicationData);
        await FileIO.WriteBytesAsync(temp, buf);
        _mediaPlayer.Source = MediaSource.CreateFromStorageFile(temp);
        _mediaPlayer.Play();
    }

    private void StopPlayback()
    {
        _playbackCts?.Cancel();
        _mediaPlayer.Pause();
        SetPlaybackUi(false);
    }

    private void SetPlaybackUi(bool playing) => IsPlaying = playing;

    private void ShowToast(string message)
    {
        ToastMessage = message;
        IsToastVisible = true;
        _ = Task.Delay(3400).ContinueWith(_ => _dispatcher.TryEnqueue(() => IsToastVisible = false));
    }

    private static string SafeName(string text, int max = 40)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return "export";
        var invalid = Path.GetInvalidFileNameChars();
        var sb = new System.Text.StringBuilder();
        foreach (var ch in trimmed.Take(max))
        {
            sb.Append(invalid.Contains(ch) ? '_' : ch);
        }

        return sb.ToString().Replace(' ', '_');
    }

    private void BumpUpdatedAt()
    {
        var project = ActiveProject;
        if (project != null) project.UpdatedAt = DateTime.UtcNow.ToString("o");
    }

    private static void MigrateProjects(IEnumerable<Project> list)
    {
        foreach (var p in list)
        {
            if (string.IsNullOrWhiteSpace(p.UpdatedAt)) p.UpdatedAt = DateTime.UtcNow.ToString("o");
            p.SentenceParamsByKey ??= new Dictionary<string, ParamSet>();
            p.SentenceProsodyByKey ??= new Dictionary<string, SegmentProsody>();
        }
    }

    public void Dispose()
    {
        _mediaPlayer.Dispose();
        _playbackCts?.Dispose();
    }
}
