using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using MaitaCOEIROINK.Models;

namespace MaitaCOEIROINK.Services;

public sealed class LocalStorageService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    private readonly string _root;

    public LocalStorageService()
    {
        _root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "maita-coeiroink-shell");
        Directory.CreateDirectory(_root);
    }

    public string ProjectsPath => Path.Combine(_root, "projects-data.json");
    public string AppSettingsPath => Path.Combine(_root, "app-settings.json");
    public string DictionaryPath => Path.Combine(_root, "user-dictionary.json");

    public async Task<ProjectsBlob> LoadProjectsAsync()
    {
        if (!File.Exists(ProjectsPath)) return new ProjectsBlob();
        await using var stream = File.OpenRead(ProjectsPath);
        return await JsonSerializer.DeserializeAsync<ProjectsBlob>(stream, JsonOptions) ?? new ProjectsBlob();
    }

    public async Task SaveProjectsAsync(ProjectsBlob blob)
    {
        await using var stream = File.Create(ProjectsPath);
        await JsonSerializer.SerializeAsync(stream, blob, JsonOptions);
    }

    public async Task<AppSettings> LoadAppSettingsAsync()
    {
        if (!File.Exists(AppSettingsPath)) return new AppSettings();
        await using var stream = File.OpenRead(AppSettingsPath);
        return await JsonSerializer.DeserializeAsync<AppSettings>(stream, JsonOptions) ?? new AppSettings();
    }

    public async Task SaveAppSettingsAsync(AppSettings settings)
    {
        await using var stream = File.Create(AppSettingsPath);
        await JsonSerializer.SerializeAsync(stream, settings, JsonOptions);
    }

    public async Task<List<DictionaryEntry>> LoadDictionaryAsync()
    {
        if (!File.Exists(DictionaryPath)) return [];
        await using var stream = File.OpenRead(DictionaryPath);
        var blob = await JsonSerializer.DeserializeAsync<DictionaryBlob>(stream, JsonOptions);
        return blob?.DictionaryWords ?? [];
    }

    public async Task SaveDictionaryAsync(IEnumerable<DictionaryEntry> entries)
    {
        var blob = new DictionaryBlob { DictionaryWords = entries.ToList() };
        await using var stream = File.Create(DictionaryPath);
        await JsonSerializer.SerializeAsync(stream, blob, JsonOptions);
    }

    public static string FormatUpdatedLabel(string? iso)
    {
        if (string.IsNullOrWhiteSpace(iso)) return "";
        if (!DateTime.TryParse(iso, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dt))
        {
            return "";
        }

        return dt.ToLocalTime().ToString("M/d HH:mm", CultureInfo.GetCultureInfo("ja-JP"));
    }

    public static string DeriveDefaultTitle(string text)
    {
        var flat = string.Join(' ', text.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Trim();
        if (flat.Length == 0) return "無題";
        return flat.Length > 10 ? flat[..10] : flat;
    }

    public static int CountMorasFromYomi(string yomi)
    {
        var s = yomi.Normalize(NormalizationForm.FormKC).Replace(" ", "").Replace("\t", "");
        if (s.Length == 0) return 1;
        const string small = "ァィゥェォャュョぁぃぅぇぉゃゅょゎ";
        var moras = 0;
        var i = 0;
        while (i < s.Length)
        {
            moras++;
            i++;
            if (i < s.Length && small.Contains(s[i])) i++;
        }

        return Math.Max(moras, 1);
    }
}
