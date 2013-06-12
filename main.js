var gzipApp = angular.module('gzipApp', []);
gzipApp.controller('AppCtrl', function AppCtrl ($scope) {
  $scope.max_cw = 64;
  $scope.icw = 10;
  $scope.animation_duration = 200;
  $scope.ssthresh = 42;
  $scope.mtu = 1400;
  $scope.rtt = 50;
  d3.csv('results.csv', function(d) {
    return {url: d.url,
            compressed_size: parseInt(d.compressed_size),
            decompressed_size: parseInt(d.decompressed_size),
            ratio: parseInt(d.compressed_size) / parseInt(d.decompressed_size),
            time: parseFloat(d.time),
           };
  }, function(data) {
    $scope.data = data;
    $scope.$digest();
  });
});

var TCPTahoe = function(icw, max_cw, ssthresh, mtu, num_bytes) {
  // a idealistic model of tcp's tahoe slow start
  var cw = icw;
  var cw_data = [];
  // put zero on the front so that we can creating a running sum.
  // take the 0 off before returning.
  var packets_transmitted = [0];

  while (num_bytes > 0) {
    // record this rtt
    cw_data.push(cw);
    packets_transmitted.push(
        packets_transmitted[packets_transmitted.length-1] + cw);
    num_bytes -= cw * mtu;

    // congestion avoidance
    if (cw >= ssthresh) {
      cw += 1;
    }
    // slow start
    else {
      cw *= 2;
      if (cw > ssthresh) {
        cw = ssthresh;
      }
    }
    // experiencing packet loss.
    if (cw > max_cw){
      // TODO(mankoff): packet loss. insert an extra, 0-packet rtt here? maybe more?
      ssthresh = Math.floor(cw / 2);
      cw = icw;
    }
  }
  packets_transmitted.shift();
  return [cw_data,  packets_transmitted];
}

var TCPReno = function(icw, max_cw, ssthresh, mtu, num_bytes) {
  // a theoretical model of tcp slow start
  var cw = icw;
  var cw_data = [];
  var packet_data = [0];

  while (num_bytes > 0) {
    cw_data.push(cw);
    packet_data.push(packet_data[packet_data.length-1] + cw);

    num_bytes -= cw * mtu;
    if (cw >= ssthresh) {
      cw += 1;
    }
    else {
      cw *= 2;
      if (cw > ssthresh) {
        cw = ssthresh;
      }
    }
    if (cw > max_cw){
      ssthresh = Math.floor(cw / 2);
      cw = ssthresh + 1;
    }
  }
  packet_data.shift();
  return [cw_data, packet_data];
}

gzipApp.directive('icwVisual', function() {
  var margins = {
    top: 10,
    right: 30,
    bottom: 30,
    left: 40};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      max_cw: '=maxCw',
      icw: '=',
      ssthresh: '=',
      mtu: '=',
      rtt: '=',
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
      var yaxis = axis_group.append('g')
        .attr('class', 'y axis')
        .attr('transform', 'translate(0,0)');

      var redraw = function() {
        if (!scope.data) {
          return;
        }

        var tcp_data = TCPTahoe(scope.icw, scope.max_cw, scope.ssthresh, scope.mtu, 
                                d3.max(scope.data, function(d) { return d.decompressed_size; }));

        var cw_data = tcp_data[0];
        var packet_data = tcp_data[1];

        var x = d3.scale.linear()
          .domain([0, cw_data.length])
          .range([0, attrs.width]);

        var cw_y = d3.scale.linear()
        .domain([0, d3.max(cw_data)])
        .range([attrs.height, margins.bottom]);

        var packet_y = d3.scale.linear()
        .domain([0, d3.max(packet_data)])
        .range([attrs.height, margins.bottom]);

        var cw_line = d3.svg.line()
        .x(function(d, i) { return x(i); })
        .y(function(d) { return cw_y(d); });

        var packet_line = d3.svg.line()
        .x(function(d, i) { return x(i); })
        .y(function(d) { return packet_y(d); });


        var path = chart.selectAll('path.line')
          .data([
            {
              css_class: 'cw',
              line_gen: cw_line,
              data: cw_data
            },
            {
              css_class: 'packet',
              line_gen: packet_line,
              data: packet_data
            }
                ]);

       path
        .transition().duration(scope.animation_duration)
          .attr('d', function(d) { return d.line_gen(d.data); });

        path.enter().append('path')
          .attr('class', function(d) { return 'line ' + d.css_class; })
          .attr('d', function(d, i) { return d.line_gen(d.data); });
        path.exit().remove();

        var formatMillis = function(millis) {
          if (millis >= 100) {
            return d3.format('.2g')(millis / 1000) + 's';
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

        yaxis
          .transition().duration(scope.animation_duration)
            .call(d3.svg.axis().scale(cw_y).orient('left'));
      };

      scope.$watch('max_cw', redraw);
      scope.$watch('icw', redraw);
      scope.$watch('data', redraw);
      scope.$watch('mtu', redraw);
      scope.$watch('ssthresh', redraw);
      scope.$watch('rtt', redraw);
    }
  };
});

gzipApp.directive('decompressTimeVisual', function() {
  var margins = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 30};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800);
      attrs.height = parseInt(attrs.height || 200);
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
          .domain([0, d3.max(scope.data, function(d) { return d.time; })])
          .range([0, attrs.width]);

        var hist = d3.layout.histogram()
          .value(function(d) { return d.time; })
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
          .text(function(d) { return d.y; });

        xaxis.call(d3.svg.axis().scale(x).orient('bottom'));
      };

      scope.$watch('data', redraw);
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
          .text(function(d) { return d.y; });

        xaxis.call(d3.svg.axis().scale(x).orient('bottom'));
      };

      scope.$watch('data', redraw);
    }
  };
});

gzipApp.directive('secondsSavedVisual', function() {
  var margins = {
    top: 10,
    right: 10,
    bottom: 30,
    left: 30};

  return {
    restrict: 'E',
    scope: {
      data: '=',
      max_cw: '=maxCw',
      icw: '=',
      mtu: '=',
      ssthresh: '=',
      rtt: '=',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800);
      attrs.height = parseInt(attrs.height || 200);
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
        if (!scope.data) {
          return;
        }

        var rtts_saved = [];
        var i;
        for (i = 0; i < scope.data.length; i++) {
          var decompressed_windows = TCPTahoe(
            scope.icw, scope.max_cw, scope.ssthresh, scope.mtu, 
            scope.data[i].decompressed_size)[0].length;
          var compressed_windows = TCPTahoe(
              scope.icw, scope.max_cw, scope.ssthresh, scope.mtu, 
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
            .attr('class', 'bar');

        bars_enter.append('rect');
        bars_enter.append('text');

        bars
          .attr('transform', function(d) { return 'translate('+ x(d.x) + ',' + y(d.y) + ')'; });

        bars.select('rect')
          .attr('x', 0)
          .attr('width', x(hist[0].dx) - 1)
          .attr('height', function(d) { return attrs.height - y(d.y); });

        bars.select('text')
          .attr('dy', '-.75em')
          .attr('y', 6)
          .attr('x', x(hist[0].dx) / 2)
          .attr('text-anchor', 'middle')
              .text(function(d) { return d.y; });

        bars.exit().remove();

        // readjust our x-scale so that it lines up with the center of the
        // bars above it.
        x.domain([-.5, d3.max(rtts_saved) + .5]);
        gXaxis.call(xaxis);
      };

      scope.$watch('max_cw', redraw);
      scope.$watch('icw', redraw);
      scope.$watch('data', redraw);
      scope.$watch('mtu', redraw);
      scope.$watch('ssthresh', redraw);
      scope.$watch('rtt', redraw);
    }
  };
});