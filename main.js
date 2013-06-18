var gzipApp = angular.module('gzipApp', ['ui.bootstrap']);
gzipApp.controller('GzipCtrl', function AppCtrl ($scope) {
  $scope.max_cw = 64;
  $scope.icw = 10;
  $scope.animation_duration = 200;
  $scope.mtu = 1400;
  $scope.rtt = 50;
  $scope.congestion_algorithm = 'tahoe';
  $scope.max_bytes = 1024*1024;
  $scope.compression_ratio = .21;
  d3.csv('results.csv', function(d) {
    return {url: d.url,
            compressed_size: parseInt(d.compressed_size),
            decompressed_size: parseInt(d.decompressed_size),
            ratio: parseInt(d.compressed_size) / parseInt(d.decompressed_size),
            time: parseFloat(d.time),
           };
  }, function(data) {
    $scope.data_desktop  = data;
    $scope.max_bytes = d3.max(data, 
                              function(d) { return d.decompressed_size; });
    $scope.compression_ratio = Math.round(d3.max(
        data, 
        function(d) { return d.compressed_size; }) / $scope.max_bytes * 100) / 100;
    $scope.$digest();
  });
  d3.csv('results.mobile.csv', function(d) {
    return {url: d.url,
            compressed_size: parseInt(d.compressed_size),
            decompressed_size: parseInt(d.decompressed_size),
            ratio: parseInt(d.compressed_size) / parseInt(d.decompressed_size),
            time: parseFloat(d.time),
           };
  }, function(data) {
    $scope.data_mobile = data;
    $scope.$digest();
  });
});

var CONGESTION_ALGORITHMS = {
  tahoe: function(icw, max_cw, mtu, rtt, num_bytes) {
    // a idealistic model of tcp's tahoe slow start
    var cw = icw;
    var cw_data = [];
    // put zero on the front so that we can creating a running sum.
    // take the 0 off before returning.
    var packets_transmitted = [0];
    var ssthresh = null;

    while (num_bytes > 0) {
      // record this rtt
      cw_data.push(cw);
      if (cw <= max_cw) {
        packets_transmitted.push(
            packets_transmitted[packets_transmitted.length - 1] + cw);
        num_bytes -= cw * mtu;

        // congestion avoidance
        if (ssthresh !== null && cw >= ssthresh) {
          cw += 1;
        }
        // slow start
        else {
          cw *= 2;
          if (ssthresh !== null && cw > ssthresh) {
            cw = ssthresh;
          }
        }
      }
      else {
        // loss occured. no packets sent this rtt.
        packets_transmitted.push(
            packets_transmitted[packets_transmitted.length - 1]);
        ssthresh = Math.floor(cw / 2);
        cw = Math.max(1, Math.min(icw, ssthresh));
      }
    }
    packets_transmitted.shift();
    return [cw_data,  packets_transmitted];
  },
  reno : function(icw, max_cw, mtu, rtt, num_bytes) {
    // a idealistic model of tcp slow start
    var cw = icw;
    var cw_data = [];
    var packet_data = [0];
    var loss_occured = false;

    while (num_bytes > 0) {
      cw_data.push(cw);
      if (cw <= max_cw) {
        packet_data.push(packet_data[packet_data.length-1] + cw);
        num_bytes -= cw * mtu;

        if (loss_occured) {
          cw += 1;
        }
        else {
          cw *= 2;
        }
      }
      else {
        packet_data.push(packet_data[packet_data.length-1]);
        loss_occured = true;
        cw = Math.max(1, Math.floor(cw / 2));
      }
    }
    packet_data.shift();
    return [cw_data, packet_data];
  },

  cubic: function(icw, max_cw, mtu, rtt, num_bytes) {
    // a idealistic model of tcp slow start
    // http://www4.ncsu.edu/~rhee/export/bitcp/cubic-paper.pdf
    // http://tools.ietf.org/id/draft-rhee-tcpm-cubic-02.txt
    var cw = icw;
    var cw_data = [];
    var packet_data = [0];
    var c = 0.4;
    var b = 0.2;
    var t = null;
    var wmax = null; // wmax is different than cw_max in that wmax is the largest
    // window that we've experienced, whereas max_cw is the 
    // largest theoretical window that we can experience.
    var reno_cw = cw;

    while (num_bytes > 0) {
      cw_data.push(cw);
      if (cw <= max_cw) {
        packet_data.push(packet_data[packet_data.length - 1] + cw);
        num_bytes -= cw * mtu;
        if (wmax === null) { // no loss yet
          cw *= 2;
          reno_cw = cw;
        }
        else {
          // t is in milliseconds, but needs to be converted to seconds.
          cw = Math.floor(c * Math.pow(t / 1000 - Math.pow(wmax * b / c, 1/3), 3) + wmax);
          // choose between cubic and reno
          reno_cw += 1;
          cw = Math.max(1, Math.max(cw, reno_cw));
          t += rtt;
        }
      }
      else {
        // loss occured. no packets were sent this rtt.
        packet_data.push(packet_data[packet_data.length - 1]);
        t = 0;
        wmax = cw;
        reno_cw = Math.floor(cw / 2);
        cw = Math.floor(cw * (1 - b));
      }

    }
    packet_data.shift();
    return [cw_data, packet_data];
  }
};

gzipApp.directive('icwVisual', function() {
  var margins = {
    top: 10,
    right: 50,
    bottom: 30,
    left: 50};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      max_cw: '=maxCw',
      icw: '=',
      mtu: '=',
      rtt: '=',
      num_bytes: '=numBytes',
      compression_ratio: '=compressionRatio',
      congestion_algorithm: '=congestionAlgorithm',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800) - margins.left - margins.right;
      attrs.height = parseInt(attrs.height || 200) - margins.top - margins.bottom;

      var margin_group = d3.select(element[0]).append('svg')
        .attr('class', 'chart')
        .attr('width', attrs.width + margins.left + margins.right)
        .attr('height', attrs.height + margins.top + margins.bottom)
        .append('g')
          .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

      var chart = margin_group.append('g');
      var axis_group = margin_group.append('g');

      var time_axis = axis_group.append('g')
        .attr('class', 'x axis time')
        .attr('transform', 'translate(0,'+attrs.height+')');
      var cw_axis = axis_group.append('g')
        .attr('class', 'x axis cw')
        .attr('transform', 'translate(0,' + (margins.top + 20) + ')');
      var cw_packets_axis = axis_group.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(0,0)');
      var total_packets_axis = axis_group.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate('+attrs.width+',0)');

      axis_group.append('text')
        .attr('class', 'axis-label rt')
        .text('Round Trips')
        .attr('x', attrs.width / 2)
        .attr('y', 5);

      axis_group.append('text')
        .attr('class', 'axis-label cwnd')
        .text('CWND Size (packets)')
        .attr('transform', 'rotate(-90)')
        .attr('x', -attrs.height / 2 - margins.top * 2)
        .attr('dy', -30);

      axis_group.append('text')
        .attr('class', 'axis-label time')
        .text('Time')
        .attr('x', attrs.width / 2)
        .attr('y', attrs.height)
        .attr('dy', 30);

      axis_group.append('text')
        .attr('class', 'axis-label packets')
        .text('Total Packets')
        .attr('transform', 'rotate(90)')
        .attr('x', attrs.height / 2 + margins.top)
        .attr('y', -attrs.width)
        .attr('dy', -30);

      var redraw = function() {
        if (!scope.data || !scope.icw || !scope.max_cw || !scope.mtu || 
            !scope.rtt || !scope.num_bytes || ! scope.compression_ratio) {
          return;
        }

        var congestion_algorithm = CONGESTION_ALGORITHMS.tahoe;
        if (scope.congestion_algorithm in CONGESTION_ALGORITHMS) {
          congestion_algorithm = CONGESTION_ALGORITHMS[scope.congestion_algorithm];
        }
        var decompressed_tcp_data = congestion_algorithm(
            scope.icw, scope.max_cw, scope.mtu, scope.rtt, scope.num_bytes);
        var compressed_tcp_data = congestion_algorithm(
            scope.icw, scope.max_cw, scope.mtu, scope.rtt, 
            scope.num_bytes * scope.compression_ratio);

        var cw_data = decompressed_tcp_data[0];
        var decompressed_data = decompressed_tcp_data[1];
        var compressed_data = compressed_tcp_data[1];

        if (cw_data.length === 1) { // got it all in one cwnd
          cw_data[1] = cw_data[0];
          decompressed_data[1] = decompressed_data[0];
        }

        var x = d3.scale.linear()
          .domain([0, cw_data.length - 1])
          .range([0, attrs.width]);

        var cw_y = d3.scale.linear()
          .domain([0, d3.max(cw_data)])
          .range([attrs.height, margins.bottom]);

        var packet_y = d3.scale.linear()
          .domain([0, d3.max(decompressed_data)])
          .range([attrs.height, margins.bottom]);

        var cw_line = d3.svg.line()
          .x(function(d, i) { return x(i); })
          .y(function(d) { return cw_y(d); });

        var packet_line = d3.svg.line()
          .x(function(d, i) { return x(i); })
          .y(function(d) { return packet_y(d); });

        var packet_area = d3.svg.area()
          .x(function(d, i) { return x(i); })
          .y0(attrs.height)
          .y1(function(d) { return packet_y(d); });

        var path = chart.selectAll('path.line')
          .data([
            {
              css_class: 'packet',
              line_gen: packet_line,
              data: decompressed_data,
              id: 'packet-path'
            },
            {
              css_class: 'cw',
              line_gen: cw_line,
              data: cw_data,
              id: 'cwnd-path'
            }]);

        var area = chart.selectAll('path.area')
          .data([
            {
              css_class: 'decompressed',
              data: decompressed_data
            },
            {
              css_class: 'compressed',
              data: compressed_data
            }])

        area.enter().append('path')
          .attr('class', function(d) { return 'area ' + d.css_class; });
        area
          .transition().duration(scope.animation_duration)
          .attr('d', function(d) { return packet_area(d.data); });
        area.exit().remove();


        path.enter().append('path')
          .attr('class', function(d) { return 'line ' + d.css_class; })
          .attr('id', function(d) { return d.id; });
        path
          .transition().duration(scope.animation_duration)
          .attr('d', function(d) { return d.line_gen(d.data); });
        path.exit().remove();

        var area_labels = chart.selectAll('text.area-label')
          .data([
            {
              css_class: 'gzipped',
              label: 'gzipped',
              dx: -4,
              position: compressed_data.length -1,
            },
            {
              css_class: 'decompressed',
              label: 'not-gzipped',
              dx: 6,
              position: compressed_data.length -1
            }]);

        area_labels.enter().append('text')
          .attr('class', function(d) { return 'area-label ' + d.css_class; })
          .attr('dy', -4)
          .attr('dx', function(d) { return d.dx; })
          .text(function(d) { return d.label });
        area_labels
          .transition().duration(scope.animation_duration)
          .attr('y', attrs.height)
          .attr('x', function(d) { return x(d.position); });

        var path_labels = chart.selectAll('text.path-label')
          .data([
            {
              css_class: 'congestion-window',
              label: 'Congestion Window',
              path_id: 'cwnd-path',
              dx: 20
            },
            {
              css_class: 'packets',
              label: 'Total Packets Sent',
              path_id: 'packet-path',
              dx: 400
            }]);

        path_labels.enter().append('text')
          .attr('class', function(d) { return 'path-label ' + d.css_class; })
          .attr('dx', function(d) { return d.dx; })
          .attr('dy', -4)
          .append('textPath')
            .attr('xlink:href', function(d) { return '#' + d.path_id; })
            .text(function(d) { return d.label });

        var formatMillis = function(millis) {
          if (millis >= 60 * 1000) {
            return d3.format('.1f')(millis / 60000) + 'm';
          }

          if (millis >= 100) {
            return d3.format('.2f')(millis / 1000) + 's';
          }
          return millis + 'ms';
        };
        time_axis
          .transition().duration(scope.animation_duration)
            .call(
              d3.svg.axis().scale(x).orient('bottom')
                .tickFormat(function(d) {
                  return formatMillis(d * scope.rtt);
                })
              );

        cw_axis
          .transition().duration(scope.animation_duration)
            .call(d3.svg.axis().scale(x).orient('top'));

        cw_packets_axis
          .transition().duration(scope.animation_duration)
              .call(d3.svg.axis().scale(cw_y).orient('left'));

        total_packets_axis
          .transition().duration(scope.animation_duration)
            .call(d3.svg.axis().scale(packet_y).orient('right'));
      };

      scope.$watch('max_cw', redraw);
      scope.$watch('icw', redraw);
      scope.$watch('data', redraw);
      scope.$watch('mtu', redraw);
      scope.$watch('rtt', redraw);
      scope.$watch('num_bytes', redraw);
      scope.$watch('congestion_algorithm', redraw);
      scope.$watch('compression_ratio', redraw);
    }
  };
});

gzipApp.directive('decompressTimeVisual', function() {
  var margins = {
    top: 10,
    right: 30,
    bottom: 30,
    left: 30};

  return {
    restrict: 'E',
    scope: {
      data_desktop: '=dataDesktop',
      data_mobile: '=dataMobile',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800) - margins.left - margins.right;
      attrs.height = parseInt(attrs.height || 200) - margins.top - margins.bottom;
      var chart = d3.select(element[0]).append('svg')
        .attr('class', 'chart')
        .attr('width', attrs.width + margins.left + margins.right)
        .attr('height', attrs.height + margins.top + margins.bottom)
        .append('g')
          .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

      var xaxis = chart.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,'+(attrs.height)+')');
      var yaxis = chart.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(0,0)');

      var legend = chart.append('g')
        .attr('class', 'legend')
        .attr('transform', 'translate(' + (attrs.width - 100) + ', 0)')
      var labels = legend.selectAll('g.label')
          .data([{label: 'Desktop', css_class: 'desktop'}, 
                 {label: 'Mobile', css_class: 'mobile'}])
          .enter().append('g')
            .attr('class', function(d) { return 'label ' + d.css_class;})
            .attr('transform', function(d, i) { return 'translate(0,' + (i * 20) + ')';});
      labels.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('height', 10)
        .attr('width', 10);
      labels.append('text')
        .attr('x', 14)
        .attr('y', 10)
        .text(function(d) { return d.label; });
      var redraw = function() {
        if (!scope.data_desktop || !scope.data_mobile) {
          return;
        }

        var data_merged = scope.data_mobile.concat(scope.data_desktop);

        var x = d3.scale.linear()
          .domain([0, d3.max(data_merged, function(d) { return d.time; })])
          .range([0, attrs.width]);

        var hist = d3.layout.histogram()
          .value(function(d) { return d.time; })
          .range([d3.min(data_merged, function(d) { return d.time; }), d3.max(data_merged, function(d) { return d.time; })])
          .bins(x.ticks(50));

        var hist_desktop = hist(scope.data_desktop);
        var hist_mobile = hist(scope.data_mobile);
        var hist_total = hist(data_merged);
        hist_desktop.css_class = 'desktop';
        hist_mobile.css_class = 'mobile';
        var y = d3.scale.linear()
          .domain([0, d3.max([
            d3.max(hist_mobile, function(d) { return d.y; }), 
            d3.max(hist_desktop, function(d) { return d.y; })])])
          .range([attrs.height, margins.bottom]);

        var stack = d3.layout.stack()([hist_desktop, hist_mobile]);

        var sets = chart.selectAll('g.data-set')
          .data(stack);
        sets.enter().append('g')
          .attr('class', function(d) { return 'data-set ' + d.css_class; });
        sets.exit().remove();
        var bars = sets.selectAll('.bar')
          .data(function(d) { return d; });
        var new_bars = bars.enter().append('g')
          .attr('class', 'bar')
          .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y + d.y0) + ')'; });
        new_bars.append('rect')
          .attr('x', 1)
          .attr('width', x(hist_desktop[0].dx) - 1)
          .attr('height', function(d) { return attrs.height - y(d.y); });

        chart.selectAll('text.total')
          .data(hist_total).enter()
          .append('text')
            .attr('class', 'total')
            .attr('dy', '-.5em')
            .attr('text-anchor', 'middle')
            .attr('y', function(d) { return y(d.y); })
            .attr('x', function(d) { return x(d.x + d.dx/2); })
            .text(function(d) { if (d.y === 0) { return ''; } return d.y; });

        xaxis.call(d3.svg.axis().scale(x).orient('bottom'));
      };

      scope.$watch('data_desktop', redraw);
      scope.$watch('data_mobile', redraw)
    }
  };
});

gzipApp.directive('compressionRatioVisual', function() {
  var margins = {
    top: 10,
    right: 30,
    bottom: 30,
    left: 30};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800) - margins.left - margins.right;
      attrs.height = parseInt(attrs.height || 200) - margins.top - margins.bottom;
      var chart = d3.select(element[0]).append('svg')
        .attr('class', 'chart')
        .attr('width', attrs.width + margins.left + margins.right)
        .attr('height', attrs.height + margins.top + margins.bottom)
        .append('g')
          .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

      var xaxis = chart.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,'+(attrs.height)+')');
      var yaxis = chart.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(0,0)');

      var redraw = function() {
        if (!scope.data) {
          return;
        }

        var x = d3.scale.linear()
          .domain([0, d3.max(scope.data, function(d) { return d.ratio; })])
          .range([0, attrs.width]);

        var hist = d3.layout.histogram()
          .value(function(d) { return d.ratio; })
          .bins(x.ticks(50))
        (scope.data);

        var y = d3.scale.linear()
          .domain([0, d3.max(hist, function(d) { return d.y; })])
          .range([attrs.height, margins.bottom]);

        var bars = chart.selectAll('.bar')
          .data(hist);
        var new_bars = bars.enter().append('g')
          .attr('class', 'bar')
          .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });
        new_bars.append('rect')
          .attr('x', 1)
          .attr('width', x(hist[0].dx) - 1)
          .attr('height', function(d) { return attrs.height - y(d.y); });

        new_bars.append('text')
          .attr('dy', '-.75em')
          .attr('y', 6)
          .attr('x', x(hist[0].dx) / 2)
          .attr('text-anchor', 'middle')
          .text(function(d) { if (d.y === 0) { return ''; } return d.y; });

        xaxis.call(
          d3.svg.axis().scale(x).orient('bottom').tickFormat(d3.format('%')));
      };

      scope.$watch('data', redraw);
    }
  };
});

gzipApp.directive('secondsSavedVisual', function() {
  var margins = {
    top: 10,
    right: 30,
    bottom: 30,
    left: 30};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      max_cw: '=maxCw',
      icw: '=',
      mtu: '=',
      rtt: '=',
      congestion_algorithm: '=congestionAlgorithm',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800) - margins.left - margins.right;
      attrs.height = parseInt(attrs.height || 200) - margins.top - margins.bottom;
      var chart = d3.select(element[0]).append('svg')
        .attr('class', 'chart')
        .attr('width', attrs.width + margins.left + margins.right)
        .attr('height', attrs.height + margins.top + margins.bottom)
        .append('g')
          .attr('transform', 'translate(' + margins.left + ',' + margins.top + ')');

      var gXaxis = chart.append('g')
          .attr('class', 'x axis')
          .attr('transform', 'translate(0,'+(attrs.height)+')');
      var gYaxis = chart.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(0,0)');

      var x = d3.scale.linear();
      var y = d3.scale.linear()

      var xaxis = d3.svg.axis().scale(x).tickSize(6,0).orient('bottom');

      var redraw = function() {
        if (!scope.data || !scope.icw || !scope.max_cw || !scope.mtu || 
            !scope.rtt) {
          return;
        }

        var congestion_algorithm = CONGESTION_ALGORITHMS.tahoe;
        if (scope.congestion_algorithm in CONGESTION_ALGORITHMS) {
          congestion_algorithm = CONGESTION_ALGORITHMS[scope.congestion_algorithm];
        }
        var rtts_saved = [];
        var i;
        for (i = 0; i < scope.data.length; i++) {
          var decompressed_windows = congestion_algorithm(
            scope.icw, scope.max_cw, scope.mtu, scope.rtt,
            scope.data[i].decompressed_size)[0].length;
          var compressed_windows = congestion_algorithm(
            scope.icw, scope.max_cw, scope.mtu, scope.rtt,
            scope.data[i].compressed_size)[0].length;
          rtts_saved.push(decompressed_windows - compressed_windows);
        }

        var rtt_hist = {};
        for (i = 0; i < rtts_saved.length; i++) {
          if (!(rtts_saved[i] in rtt_hist)) {
            rtt_hist[rtts_saved[i]] = 0;
          }
          rtt_hist[rtts_saved[i]]++; 
        }

        var hist = d3.layout.histogram()
          .bins(d3.min([50, d3.max(rtts_saved) + 1]))
        (rtts_saved);

        x.domain([0, d3.max(rtts_saved)])
            .range([0, attrs.width]);

        y.domain([0, d3.max(hist, function(d) { return d.y; })])
          .range([attrs.height, margins.bottom]);

        var bars = chart.selectAll('.bar')
          .data(hist);
        var bars_enter = bars.enter().append('g')
            .attr('class', 'bar')
            .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });

        bars_enter.append('rect')
          .attr('x', 0)
          .attr('width', x(hist[0].dx) - 1)
          .attr('height', function(d) { return attrs.height - y(d.y); });

        bars_enter.append('text')
          .attr('dy', '-.75em')
          .attr('y', 6)
          .attr('x', x(hist[0].dx) / 2)
          .attr('opacity', 0)
          .attr('text-anchor', 'middle')
          .text(function(d) { if (d.y === 0) { return ''; } return d.y; });

        bars.transition().duration(scope.animation_duration)
          .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });

        bars.select('rect').transition().duration(scope.animation_duration)
          .attr('x', 0)
          .attr('width', x(hist[0].dx) - 1)
          .attr('height', function(d) { return attrs.height - y(d.y); });

        bars.select('text').transition().duration(scope.animation_duration)
          .attr('dy', '-.75em')
          .attr('y', 6)
          .attr('x', x(hist[0].dx) / 2)
          .attr('text-anchor', 'middle')
          .text(function(d) { if (d.y === 0) { return; ''; } return d.y; })
          .attr('opacity', 1);

        bars.exit().remove();

        // readjust our x-scale so that it lines up with the center of the
        // bars above it.
        x.domain([-.5, d3.max(rtts_saved) + .5]);
        gXaxis.transition().duration(scope.animation_duration)
          .call(xaxis);

        var avg_savings = chart.selectAll('text.average-savings')
          .data([d3.mean(rtts_saved)]);

        avg_savings.enter().append('text')
          .attr('class', 'average-savings')
          .attr('x', attrs.width)
          .attr('y', margins.top);
        avg_savings
          .text(function(d) { 
            return 'Average RTTs Saved: '+ d3.format('.2f')(d); 
          });
      };

      scope.$watch('max_cw', redraw);
      scope.$watch('icw', redraw);
      scope.$watch('data', redraw);
      scope.$watch('mtu', redraw);
      scope.$watch('rtt', redraw);
      scope.$watch('congestion_algorithm', redraw);
    }
  };
});