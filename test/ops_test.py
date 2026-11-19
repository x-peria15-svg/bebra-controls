import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ops', pathlib.Path(__file__).parents[1] / 'deploy' / 'ops.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)

class OperationsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.shared = self.root / 'shared'
        self.shared.mkdir()
        self.override = patch.object(ops, 'SHARED', self.shared)
        self.override.start()
        self.uuid = '11111111-1111-4111-8111-111111111111'
        self.server = self.root / self.uuid
        self.server.mkdir()
        self.config = {'volumes': str(self.root), 'shared_limit_bytes': 1024**3}
        (self.server / 'sample.txt').write_text('sample data')
        self.data = {'source': {'kind': 'server', 'uuid': self.uuid, 'path': '/sample.txt'}, 'target': {'kind': 'shared', 'path': '/copy.txt'}}

    def tearDown(self):
        self.override.stop()
        self.tmp.cleanup()

    def test_copy_and_verified_move(self):
        result = ops.transfer(self.data, self.config)
        self.assertEqual(result['bytes'], 11)
        self.assertEqual((self.shared / 'copy.txt').read_text(), 'sample data')
        self.assertTrue((self.server / 'sample.txt').exists())
        self.data['target']['path'] = '/moved.txt'
        self.data['move'] = True
        ops.transfer(self.data, self.config)
        self.assertFalse((self.server / 'sample.txt').exists())

    def test_no_overwrite_and_original_preserved(self):
        (self.shared / 'copy.txt').write_text('existing')
        self.data['move'] = True
        with self.assertRaises(FileExistsError):
            ops.transfer(self.data, self.config)
        self.assertEqual((self.shared / 'copy.txt').read_text(), 'existing')
        self.assertTrue((self.server / 'sample.txt').exists())

    def test_traversal_rejected(self):
        self.data['target']['path'] = '/../escape'
        with self.assertRaises(ValueError):
            ops.transfer(self.data, self.config)

    def test_symlink_source_rejected(self):
        (self.server / 'link').symlink_to(self.server / 'sample.txt')
        self.data['source']['path'] = '/link'
        with self.assertRaises(OSError):
            ops.transfer(self.data, self.config)

    def test_symlink_directory_rejected(self):
        (self.shared / 'link').symlink_to(self.server, target_is_directory=True)
        self.data['target']['path'] = '/link/escape'
        with self.assertRaises(OSError):
            ops.transfer(self.data, self.config)

    def test_shared_quota(self):
        self.config['shared_limit_bytes'] = 1
        with self.assertRaises(ValueError):
            ops.transfer(self.data, self.config)

    def test_dns_must_only_point_to_host(self):
        with patch.object(ops.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('192.0.2.11', 80))]):
            with self.assertRaises(ValueError):
                ops.domain({'domain': 'site.example.com'}, {'public_ips': ['192.0.2.10']})

    def test_invalid_domain(self):
        for name in ['https://site.example.com', 'example.com;command', '*.example.com', '127.0.0.1']:
            with self.assertRaises(ValueError):
                ops.domain_name(name)

if __name__ == '__main__':
    unittest.main()
