using MaitaCOEIROINK.ViewModels;
using MaitaCOEIROINK.Views;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;

namespace MaitaCOEIROINK;

public sealed partial class MainWindow : Window
{
    public MainViewModel ViewModel { get; }

    public MainWindow()
    {
        ViewModel = new MainViewModel(DispatcherQueue.GetForCurrentThread());
        InitializeComponent();
        MainView.BindViewModel(ViewModel);
        ExtendsContentIntoTitleBar = true;
        SetWindowSize(1280, 800);
    }

    private void SetWindowSize(int width, int height)
    {
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(this);
        var windowId = Microsoft.UI.Win32Interop.GetWindowIdFromWindow(hwnd);
        var appWindow = Microsoft.UI.Windowing.AppWindow.GetFromWindowId(windowId);
        appWindow.Resize(new Windows.Graphics.SizeInt32(width, height));
    }
}
