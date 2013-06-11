var gzipApp = angular.module('gzipApp', []);
gzipApp.controller('AppCtrl', function AppCtrl ($scope) {
  $scope.max_cw = 64;
  $scope.icw = 10;
  $scope.animation_duration = 200;
  $scope.ssthresh = 64000;
  $scope.mtu = 1400;
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

gzipApp.directive('icwVisual', function() {
  chart_margins = {
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
      ssthresh: '=',
      mtu: '=',
      animation_duration: '=animationDuration'
    },
    link: function(scope, element, attrs) {
      attrs.width = parseInt(attrs.width || 800);
      attrs.height = parseInt(attrs.height || 200);

      var chart = d3.select(element[0]).append('svg')
        .attr('class', 'chart')
        .attr('width', attrs.width + chart_margins.left + chart_margins.right)
        .attr('height', attrs.height + chart_margins.top + chart_margins.bottom)
        .append('g')
          .attr('transform', 'translate(' + chart_margins.left + ',' + chart_margins.top + ')');

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
        // a theoretical model of tcp slow start
        var cw = scope.icw;
        var ssthresh = scope.ssthresh;
        var max_size = d3.max(scope.data, function(d) { return d.decompressed_size; });

        var cw_data = [];
        var packet_data = [0];

        while (max_size > 0) {
          cw_data.push(cw);
          packet_data.push(packet_data[packet_data.length-1] + cw);

          max_size -= cw * scope.mtu;
          if (cw >= Math.floor(ssthresh / scope.mtu)) {
            cw += 1;
          }
          else {
            cw *= 2;
            if (cw * scope.mtu > ssthresh) {
              cw = Math.floor(ssthresh / scope.mtu);
            }
          }
          if (cw > scope.max_cw) {
            ssthresh = cw * scope.mtu / 2;
            cw = scope.icw;
          }
        }
        // remove 0 off the front of our packet_data
        packet_data.shift();

        var x = d3.scale.linear()
          .domain([0, cw_data.length])
          .range([0, attrs.width]);

        var cw_y = d3.scale.linear()
        .domain([0, d3.max(cw_data)])
        .range([attrs.height, chart_margins.bottom]);

        var packet_y = d3.scale.linear()
        .domain([0, d3.max(packet_data)])
        .range([attrs.height, chart_margins.bottom]);

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

        xaxis
          .transition().duration(scope.animation_duration)
            .call(d3.svg.axis().scale(x).orient('bottom'));

        yaxis
          .transition().duration(scope.animation_duration)
            .call(d3.svg.axis().scale(cw_y).orient('left'));


      };

      scope.$watch('max_cw', redraw);
      scope.$watch('icw', redraw);
      scope.$watch('data', redraw);
      scope.$watch('mtu', redraw);
      scope.$watch('ssthresh', redraw);
    }
  };
});

gzipApp.directive('decompressTimeVisual', function() {
  margins = {
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
      var chart = d3.select('body').append('svg')
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
  margins = {
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
      var chart = d3.select('body').append('svg')
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