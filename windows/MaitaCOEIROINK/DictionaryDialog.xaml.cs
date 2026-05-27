using System.Collections.ObjectModel;
using MaitaCOEIROINK.Models;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;

namespace MaitaCOEIROINK;

public sealed partial class DictionaryDialog : ContentDialog
{
    public ObservableCollection<DictionaryEntry> Entries { get; } = [];

    public DictionaryDialog(IEnumerable<DictionaryEntry> seed)
    {
        InitializeComponent();
        foreach (var e in seed) Entries.Add(new DictionaryEntry { Word = e.Word, Yomi = e.Yomi, Accent = e.Accent });
        if (Entries.Count == 0) Entries.Add(new DictionaryEntry { Accent = 1 });
        EntriesList.ItemsSource = Entries;
    }

    private void OnAddRow(object sender, RoutedEventArgs e) => Entries.Add(new DictionaryEntry { Accent = 1 });

    private void OnDeleteRow(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: DictionaryEntry entry })
        {
            Entries.Remove(entry);
            if (Entries.Count == 0) Entries.Add(new DictionaryEntry { Accent = 1 });
        }
    }

    public List<DictionaryEntry> GetEntries()
    {
        var rows = new List<DictionaryEntry>();
        foreach (var e in Entries)
        {
            var word = e.Word.Trim();
            var yomi = e.Yomi.Trim();
            if (word.Length == 0 && yomi.Length == 0) continue;
            if (word.Length == 0 || yomi.Length == 0)
            {
                throw new InvalidOperationException("辞書では「単語」と「読み」の両方を入力してください（空の行のみスキップできます）。");
            }

            rows.Add(new DictionaryEntry
            {
                Word = word,
                Yomi = yomi,
                Accent = Math.Max(0, (int)Math.Floor(e.Accent)),
            });
        }

        return rows;
    }

    private void OnPrimaryClick(ContentDialog sender, ContentDialogButtonClickEventArgs args)
    {
        try
        {
            _ = GetEntries();
        }
        catch (Exception ex)
        {
            args.Cancel = true;
            _ = ShowValidationAsync(ex.Message);
        }
    }

    private async Task ShowValidationAsync(string message)
    {
        var dlg = new ContentDialog
        {
            Title = "辞書",
            Content = message,
            CloseButtonText = "OK",
            XamlRoot = XamlRoot,
        };
        await dlg.ShowAsync();
    }
}
