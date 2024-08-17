setInterval(() => {
  let create_time = Math.round(
    new Date("2024-07-16 00:00:00").getTime() / 1000,
  ); //在此行修改建站时间
  let timestamp = Math.round(new Date().getTime() / 1000);
  let second = timestamp - create_time;
  let time = new Array(0, 0, 0, 0, 0);

  var nol = function (h) {
    return h > 9 ? h : "0" + h;
  };
  if (second >= 365 * 24 * 3600) {
    time[0] = parseInt(second / (365 * 24 * 3600));
    second %= 365 * 24 * 3600;
  }
  if (second >= 24 * 3600) {
    time[1] = parseInt(second / (24 * 3600));
    second %= 24 * 3600;
  }
  if (second >= 3600) {
    time[2] = nol(parseInt(second / 3600));
    second %= 3600;
  }
  if (second >= 60) {
    time[3] = nol(parseInt(second / 60));
    second %= 60;
  }
  if (second > 0) {
    time[4] = nol(second);
  }
  if (Number(time[2]) < 22 && Number(time[2]) > 9) {
    currentTimeHtml =
      "<img class='boardsign' src='https://img.shields.io/badge/%E6%89%93%E5%B7%A5%E4%B8%AD-%E6%91%B8%E9%B1%BC-blue' title='公司不倒我不倒'><div id='runtime'>" +
      "已运行 " +
      time[0] +
      " 年 " +
      time[1] +
      " 天 " +
      time[2] +
      " 小时 " +
      time[3] +
      " 分钟 " +
      time[4] +
      " 秒</div>";
  } else {
    currentTimeHtml =
      "<img class='boardsign' src='https://img.shields.io/badge/%E4%B8%8B%E7%8F%AD%E4%BA%86-%E6%9D%BE%E5%BC%9B-purple' title='陪伴家人好男儿'><div id='runtime'>" +
      "已运行 " +
      time[0] +
      " 年 " +
      time[1] +
      " 天 " +
      time[2] +
      " 小时 " +
      time[3] +
      " 分钟 " +
      time[4] +
      " 秒</div>";
  }
  document.getElementById("workboard").innerHTML = currentTimeHtml;
}, 1000);
