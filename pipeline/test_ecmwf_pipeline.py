import unittest

from pipeline.ecmwf_pipeline import STEPS, risk_level, risk_score


class RiskScoreTests(unittest.TestCase):
    def test_automated_download_contains_only_dashboard_and_scoring_fields(self):
        self.assertEqual(STEPS, (3, 24, 72))

    def test_dry_forecast_is_zero_and_low(self):
        score = risk_score(mean24=0, p90_24=0, max24=0, mean72=0, frac50=0)
        self.assertEqual(score, 0)
        self.assertEqual(risk_level(score), "LOW")

    def test_extreme_inputs_are_capped_at_one_hundred(self):
        score = risk_score(mean24=500, p90_24=500, max24=500, mean72=900, frac50=1)
        self.assertEqual(score, 100)
        self.assertEqual(risk_level(score), "EXTREME")

    def test_risk_band_boundaries_are_stable(self):
        self.assertEqual(risk_level(24), "LOW")
        self.assertEqual(risk_level(25), "ELEVATED")
        self.assertEqual(risk_level(50), "HIGH")
        self.assertEqual(risk_level(70), "VERY_HIGH")
        self.assertEqual(risk_level(85), "EXTREME")


if __name__ == "__main__":
    unittest.main()
