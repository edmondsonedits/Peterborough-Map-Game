import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).parents[1] / 'scripts' / 'build-city-training.py'
spec = importlib.util.spec_from_file_location('city_training', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CityExtractTests(unittest.TestCase):
    def test_vehicle_access_precedence(self):
        self.assertTrue(module.drivable({'highway':'residential'}))
        self.assertFalse(module.drivable({'highway':'footway'}))
        self.assertFalse(module.drivable({'highway':'residential','access':'private'}))
        self.assertTrue(module.drivable({'highway':'residential','access':'private','motor_vehicle':'yes'}))
        self.assertFalse(module.drivable({'highway':'service','access':'yes','motor_vehicle':'no'}))
        self.assertFalse(module.drivable({'highway':'construction'}))

    def test_community_and_coordinates_both_required(self):
        city={'id':'ajax','name':'Ajax','bounds':[[43,-80],[45,-78]]}
        record={'properties':{'COMMUNITY':'Pickering'},'geometry':{'coordinates':[-79,44]}}
        self.assertFalse(module.belongs(record, city))
        record['properties']['COMMUNITY']='Ajax'
        self.assertTrue(module.belongs(record, city))
        record['geometry']['coordinates']=[-81,44]
        self.assertFalse(module.belongs(record, city))

if __name__ == '__main__': unittest.main()
