import csv
import requests
import sys
import timeit
import zlib

inp = open('top-1m.csv')
out = open('results.csv', 'w')
reader = csv.reader(inp)
writer = csv.writer(out)

writer.writerow(('url', 'compressed_size', 'decompressed_size', 'time'))

num_sites = 1000
num_tests = 100
results = {}

num = 0
for row in reader:
  num += 1
  if num > num_sites:
    break

  print row[1],
  sys.stdout.flush()
  try:
    r = requests.get('http://' + row[1], headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/28.0.1500.36 Safari/537.36'}, stream=True)
  except KeyboardInterrupt:
    break
  except:
    print 'error'
    continue
  raw = r.raw
  data = raw.data  # load the compressed data up
  content_encoding = raw.headers.get('content-encoding', '').lower()
  if content_encoding != 'gzip':
    print 'not gzip'
    continue

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
  writer.writerow((row[1], results[row[1]]['compressed_size'], results[row[1]]['decompressed_size'], results[row[1]]['time']))
