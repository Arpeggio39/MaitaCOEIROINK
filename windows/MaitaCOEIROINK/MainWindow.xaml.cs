using System.ComponentModel;
using MaitaCOEIROINK.Helpers;
using MaitaCOEIROINK.Models;
using MaitaCOEIROINK.ViewModels;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Dispatching;

namespace MaitaCOEIROINK;

public sealed partial class MainWindow : Window
{
    private bool _intonationScrollSyncing;
    private bool _suppressEditorChange;
    private StackPanel? _moraTextPanel;
    private StackPanel? _moraSliderPanel;

    public MainViewModel ViewModel { get; }

    public MainWindow()
    {
        ViewModel = new MainViewModel(DispatcherQueue.GetForCurrentThread());
        InitializeComponent();
        BindingRoot.DataContext = ViewModel;
        ViewModel.SegmentMirrorChanged += (_, _) => ViewModel.BuildSegmentMirror(SegmentMirror);
        ViewModel.MoraSpans.CollectionChanged += (_, _) => RebuildIntonationUi();
        ViewModel.MoraCells.CollectionChanged += (_, _) => RebuildIntonationUi();
        ViewModel.PropertyChanged += OnViewModelPropertyChanged;
        ExtendsContentIntoTitleBar = true;
        SetWindowSize(1280, 800);
        RootGrid.Loaded += OnLoaded;
        RootGrid.KeyDown += OnRootKeyDown;
    }

    private void OnRootKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Escape)
        {
            ViewModel.DismissSentenceSelectionCommand.Execute(null);
        }
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        RootGrid.Loaded -= OnLoaded;
        _suppressEditorChange = true;
        Editor.Text = ViewModel.EditorText;
        _suppressEditorChange = false;
        ViewModel.BuildSegmentMirror(SegmentMirror);
        await ViewModel.InitializeAsync();
    }

    private void OnViewModelPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(MainViewModel.EditorText))
        {
            if (Editor.Text != ViewModel.EditorText)
            {
                _suppressEditorChange = true;
                Editor.Text = ViewModel.EditorText;
                _suppressEditorChange = false;
            }
        }
        else if (e.PropertyName == nameof(MainViewModel.IsTitleEditVisible))
        {
            TitleBlock.Visibility = ViewModel.IsTitleEditVisible ? Visibility.Collapsed : Visibility.Visible;
            if (ViewModel.IsTitleEditVisible)
            {
                TitleBox.Focus(FocusState.Programmatic);
                TitleBox.SelectAll();
            }
        }
    }

    private void SetWindowSize(int width, int height)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWindow = Microsoft.UI.Windowing.AppWindow.GetFromWindowId(windowId);
        appWindow.Resize(new Windows.Graphics.SizeInt32(width, height));
    }

    private void OnProjectItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is ProjectListItem item)
        {
            ViewModel.SelectProjectCommand.Execute(item.Project.Id);
        }
    }

    private void OnDeleteProjectClick(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string id })
        {
            ViewModel.DeleteProjectCommand.Execute(id);
        }
    }

    private void OnEditorTextChanging(object sender, TextBoxTextChangingEventArgs e)
    {
        if (_suppressEditorChange) return;
        ViewModel.ApplyEditorTextChange(Editor.Text);
    }

    private void OnEditorSelectionChanged(object sender, RoutedEventArgs e)
    {
        ViewModel.OnEditorSelectionChanged(Editor.SelectionStart);
    }

    private void OnEditorScrollChanged(object sender, ScrollViewerViewChangedEventArgs e)
    {
        MirrorScroll.ChangeView(null, EditorScroll.VerticalOffset, null, true);
    }

    private void OnTitleTapped(object sender, TappedRoutedEventArgs e) => ViewModel.BeginTitleEditCommand.Execute(null);

    private void OnTitleLostFocus(object sender, RoutedEventArgs e) => ViewModel.CommitTitleEditCommand.Execute(null);

    private void OnTitleKeyDown(object sender, KeyRoutedEventArgs e)
    {
        if (e.Key == Windows.System.VirtualKey.Enter)
        {
            e.Handled = true;
            ViewModel.CommitTitleEditCommand.Execute(null);
        }
        else if (e.Key == Windows.System.VirtualKey.Escape)
        {
            e.Handled = true;
            ViewModel.CancelTitleEditCommand.Execute(null);
        }
    }

    private void OnIntonationScrollChanged(object sender, ScrollViewerViewChangedEventArgs e)
    {
        if (_intonationScrollSyncing) return;
        _intonationScrollSyncing = true;
        IntonationSliderScroll.ChangeView(IntonationTextScroll.HorizontalOffset, null, null, true);
        _intonationScrollSyncing = false;
    }

    private void OnIntonationSliderScrollChanged(object sender, ScrollViewerViewChangedEventArgs e)
    {
        if (_intonationScrollSyncing) return;
        _intonationScrollSyncing = true;
        IntonationTextScroll.ChangeView(IntonationSliderScroll.HorizontalOffset, null, null, true);
        _intonationScrollSyncing = false;
    }

    private void RebuildIntonationUi()
    {
        _moraTextPanel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 0 };
        foreach (var span in ViewModel.MoraSpans)
        {
            var box = new TextBox
            {
                Text = span.Hira,
                MinWidth = Math.Max(36, span.Hira.Length * 18),
            };
            box.LostFocus += (_, _) => ViewModel.UpdateMoraHira(span, box.Text);
            _moraTextPanel.Children.Add(box);
        }

        IntonationTextScroll.Content = _moraTextPanel;

        _moraSliderPanel = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 0 };
        var moraUi = new Dictionary<SegmentMora, List<Slider>>();
        foreach (var cell in ViewModel.MoraCells)
        {
            var col = new StackPanel { Width = 36, HorizontalAlignment = HorizontalAlignment.Center, Spacing = 6 };
            var pitchLabel = new TextBlock
            {
                Text = cell.Pitch.ToString("0.00"),
                FontSize = 10,
                HorizontalAlignment = HorizontalAlignment.Center,
                Foreground = (Brush)Application.Current.Resources["AccentTextFillColorPrimaryBrush"],
            };
            var slider = new Slider
            {
                Minimum = AppConstants.MoraPitchMin,
                Maximum = AppConstants.MoraPitchMax,
                StepFrequency = 0.05,
                Value = cell.Pitch,
                Tag = cell.Mora,
            };
            if (!moraUi.ContainsKey(cell.Mora)) moraUi[cell.Mora] = [];
            moraUi[cell.Mora].Add(slider);
            slider.ValueChanged += (_, args) =>
            {
                ViewModel.SetMoraPitch(cell.Mora, args.NewValue);
                var v = cell.Mora.GetPitch();
                foreach (var s in moraUi[cell.Mora]) s.Value = v;
                foreach (var colPanel in _moraSliderPanel!.Children.OfType<StackPanel>())
                {
                    if (colPanel.Children.OfType<Slider>().Any(s => ReferenceEquals(s.Tag, cell.Mora)))
                    {
                        if (colPanel.Children[0] is TextBlock tb) tb.Text = v.ToString("0.00");
                    }
                }
            };
            col.Children.Add(pitchLabel);
            col.Children.Add(slider);
            _moraSliderPanel.Children.Add(col);
        }

        IntonationSliderScroll.Content = _moraSliderPanel;
    }
}
