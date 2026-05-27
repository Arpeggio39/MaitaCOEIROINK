namespace MaitaCOEIROINK.Models;

public sealed class ParamSet
{
    public double SpeedScale { get; set; } = 1;
    public double PitchScale { get; set; }
    public double IntonationScale { get; set; } = 1;
    public double VolumeScale { get; set; } = 1;
    public double PrePhonemeLength { get; set; } = 0.1;
    public double PostPhonemeLength { get; set; } = 0.1;
    public string ProcessingAlgorithm { get; set; } = "td-psola";

    public ParamSet Clone() => new()
    {
        SpeedScale = SpeedScale,
        PitchScale = PitchScale,
        IntonationScale = IntonationScale,
        VolumeScale = VolumeScale,
        PrePhonemeLength = PrePhonemeLength,
        PostPhonemeLength = PostPhonemeLength,
        ProcessingAlgorithm = ProcessingAlgorithm,
    };

    public bool Equals(ParamSet? other)
    {
        if (other is null) return false;
        return SpeedScale == other.SpeedScale
            && PitchScale == other.PitchScale
            && IntonationScale == other.IntonationScale
            && VolumeScale == other.VolumeScale
            && PrePhonemeLength == other.PrePhonemeLength
            && PostPhonemeLength == other.PostPhonemeLength
            && ProcessingAlgorithm == other.ProcessingAlgorithm;
    }
}

public static class ParamDefaults
{
    public static ParamSet Create() => new();
}
