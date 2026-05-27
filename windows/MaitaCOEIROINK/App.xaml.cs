using Microsoft.UI.Xaml;

namespace MaitaCOEIROINK;

public partial class App : Application
{
    public App()
    {
        InitializeComponent();
    }

    public static Window MainWindow { get; private set; } = null!;
    public static UIElement MainWindowContent => MainWindow.Content as UIElement
        ?? throw new InvalidOperationException("Main window content is not set.");

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        MainWindow = new MainWindow();
        MainWindow.Activate();
    }
}
