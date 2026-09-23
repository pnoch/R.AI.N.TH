import unittest
from datetime import datetime, timezone

from pipeline.verification_pipeline import (
    clean_observations,
    filter_current_reporting_window,
    pearson,
    reporting_window,
)


class VerificationPipelineTests(unittest.TestCase):
    def setUp(self):
        self.rows = [
            {
                "id": 1,
                "rain_24h": 20.0,
                "rainfall_datetime": "2026-09-23 06:00",
                "geocode": {"province_code": "27", "province_name": {"th": "สระแก้ว"}},
                "station": {"id": 101, "tele_station_name": {"th": "A"}},
            },
            {
                "id": 2,
                "rain_24h": 10.0,
                "rainfall_datetime": "2026-09-22 20:00",
                "geocode": {"province_code": "27", "province_name": {"th": "สระแก้ว"}},
                "station": {"id": 102, "tele_station_name": {"th": "B"}},
            },
            {
                "id": 3,
                "rain_24h": -1.0,
                "rainfall_datetime": "2026-09-23 07:00",
                "geocode": {"province_code": "27", "province_name": {"th": "สระแก้ว"}},
                "station": {"id": 103, "tele_station_name": {"th": "C"}},
            },
        ]

    def test_cleaning_rejects_negative_rainfall(self):
        cleaned = clean_observations(self.rows)
        self.assertEqual(len(cleaned), 2)
        self.assertEqual(cleaned[0]["provinceIso"], "TH-27")

    def test_reporting_day_maps_to_previous_00z_forecast(self):
        cleaned = clean_observations(self.rows)
        forecast_run, valid_end = reporting_window(cleaned)
        self.assertEqual(forecast_run, datetime(2026, 9, 22, 0, tzinfo=timezone.utc))
        self.assertEqual(valid_end, datetime(2026, 9, 23, 0, tzinfo=timezone.utc))
        current = filter_current_reporting_window(cleaned, valid_end)
        self.assertEqual([row["stationId"] for row in current], ["101"])

    def test_pearson_handles_signal_and_degenerate_series(self):
        self.assertEqual(pearson([1, 2, 3], [2, 4, 6]), 1.0)
        self.assertIsNone(pearson([1, 1, 1], [2, 3, 4]))


if __name__ == "__main__":
    unittest.main()
