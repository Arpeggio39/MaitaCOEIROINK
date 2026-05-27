using Microsoft.UI.Xaml;
using MaitaCOEIROINK.Models;
using MaitaCOEIROINK.Services;

namespace MaitaCOEIROINK.Helpers;

public sealed class MoraCountConverter : Microsoft.UI.Xaml.Data.IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, string language)
        => LocalStorageService.CountMorasFromYomi(value as string ?? "").ToString();

    public object ConvertBack(object value, Type targetType, object parameter, string language)
        => throw new NotSupportedException();
}
