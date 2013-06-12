try:
  from csv import reader, writer
except ImportError:
  def reader(input_file):
    for line in input_file:
      yield line.strip().split(',')

  class writer(object):
    def __init__(self, output_file):
      self.output_file = output_file

    def writerow(self, row):
      self.output_file.write(','.join((unicode(v) for v in row)) + '\n')

import sys
import timeit
import urllib2
import zlib

inp = reader(open('top-1m.csv'))
out = writer(open('results.csv', 'w'))

out.writerow(('url', 'compressed_size', 'decompressed_size', 'time'))

num_sites = 1000
num_tests = 100
results = {}

num = 0
for row in inp:
  num += 1
  if num > num_sites:
    break

  print row[1],
  sys.stdout.flush()
  try:
    request = urllib2.Request(
      'http://'+row[1], None,
      {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.36 Safari/537.36',
       'accept-encoding': 'gzip',
       'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
       }
      )
    response = urllib2.urlopen(request)
    info = response.info()
  except KeyboardInterrupt:
    break
  except:
    print 'error'
    continue
  content_encoding = info.get('content-encoding', '').lower()
  if content_encoding != 'gzip':
    print 'not gzip'
    continue
  data = response.read()

  total_time = sum(timeit.repeat('decoder.decompress(data)', setup='from __main__ import data; import zlib; decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)', repeat=num_tests, number=1))
  decoder = zlib.decompressobj(16 + zlib.MAX_WBITS)
  results[row[1]] = {
      'compressed_size': len(data),
      'decompressed_size': len(decoder.decompress(data)),
      'time': total_time / num_tests * 1000,
      }

  print 'GZipped: {compressed_size}KB; Decompressed: {decompressed_size}KB; Time: {time}ms'.format(
      compressed_size=results[row[1]]['compressed_size'] / 1024,
      decompressed_size=results[row[1]]['decompressed_size'] / 1024,
      time=results[row[1]]['time'])
  out.writerow((row[1], results[row[1]]['compressed_size'], results[row[1]]['decompressed_size'], results[row[1]]['time']))
