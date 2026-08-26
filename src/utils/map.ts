import 'ol/ol.css';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import Map from 'ol/Map';
import Overlay from 'ol/Overlay';
import { Projection, addProjection, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import TileImage from 'ol/source/TileImage';
import VectorSource from 'ol/source/Vector';
import { Style, Icon } from 'ol/style';
import TileGrid from 'ol/tilegrid/TileGrid';
import View from 'ol/View';
import proj4 from 'proj4';
import brand from '@/assets/images/brand.png';

/**
 * 注册百度地图坐标系
 */
function registerBaiduProjections() {
  proj4.defs('BD-09-LL', '+proj=longlat +datum=BD09 +no_defs');
  proj4.defs(
    'BD-09',
    '+proj=merc +a=6378206 +b=6356584.314245179 +lat_ts=0.0 +lon_0=0.0 +x_0=0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs'
  );
  register(proj4);
}

const defaultCenter = [111.4610712, 27.2426563]
/**
 * 初始化 OpenLayers 百度地图
 */
export function initBaiduMap(domId, centerLL = defaultCenter) {
  registerBaiduProjections();

  const baiduProj = new Projection({
    code: 'BD-09',
    extent: [-20037508.34, -20037508.34, 20037508.34, 20037508.34],
    units: 'm',
    worldExtent: [-180, -74, 180, 74]
  });
  addProjection(baiduProj);

  const resolutions = [];
  for (let i = 0; i <= 19; i++) {
    resolutions[i] = Math.pow(2, 18 - i);
  }

  const baiduTileGrid = new TileGrid({
    origin: [0, 0],
    resolutions: resolutions,
    tileSize: 256
  });

  const baiduSource = new TileImage({
    projection: baiduProj,
    tileGrid: baiduTileGrid,
    tileUrlFunction: function (tileCoord) {
      if (!tileCoord) return '';
      const z = tileCoord[0] || 0;
      const x = tileCoord[1] || 0;
      const y = tileCoord[2] || 0;

      let xc = x < 0 ? 'M' + -x : x;
      let yc = -y - 1 < 0 ? 'M' + -(-y - 1) : -y - 1;

      //   const num = Math.floor(Math.random() * 8);
      const num = 1;
      return `https://maponline${num}.bdimg.com/tile/?qt=vtile&x=${xc}&y=${yc}&z=${z}&styles=pl&scaler=1&udt=20200810`;
    }
  });

  const centerCoord = transform(centerLL, 'BD-09-LL', 'BD-09');

  const map = new Map({
    target: domId,
    layers: [
      new TileLayer({
        source: baiduSource
      })
    ],
    view: new View({
      projection: baiduProj,
      center: centerCoord,
      zoom: 14,
      maxZoom: 18,
      minZoom: 3
    })
  });

  return map;
}

/**
 * 在地图上添加广告牌图片标注及鼠标 Hover 提示弹窗
 * @param {Map} map - OpenLayers 地图实例
 * @param {Array} billboardList - 广告牌数据列表
 * @param {HTMLElement} popupContainerEl - 弹窗 DOM 元素
 */
export function addBillboardsWithHover(map: any, billboardList: any, popupContainerEl: any) {
  // 1. 创建 Overlay 弹窗实例
  const popupOverlay = new Overlay({
    element: popupContainerEl,
    positioning: 'bottom-center', // 弹窗锚点在底部中间
    stopEvent: false, // 允许鼠标透传事件
    offset: [20, -20] // 向右上面偏移 20 像素，避免挡住标注图标
  });
  map.addOverlay(popupOverlay);

  // 2. 将数据转换为 OpenLayers 要素 (Feature)
  const features = billboardList.map((item: any): any => {
    // 经纬度 -> 百度墨卡托平面坐标
    const coord = transform([Number(item.longitude), Number(item.latitude)], 'BD-09-LL', 'BD-09');

    const feature = new Feature({
      geometry: new Point(coord),
      data: item // 将原始数据保存在 feature 内部以便悬停时获取
    });

    // 为每个标注设置图片样式
    feature.setStyle(
      new Style({
        image: new Icon({
          src: brand,
          anchor: [0.5, 1], // 图片底边中心对齐坐标点
          scale: 0.5 // 缩放图片比例，可根据需要调节
        })
      })
    );

    return feature;
  });

  // 3. 将要素添加到矢量图层
  const vectorSource = new VectorSource({ features });
  const vectorLayer = new VectorLayer({ source: vectorSource });
  map.addLayer(vectorLayer);

  // 4. 监听鼠标移动事件 (Hover 悬停)
  map.on('pointermove', (evt: any) => {
    // 拖拽地图时不触发
    if (evt.dragging) {
      popupOverlay.setPosition(undefined);
      return;
    }

    // 拾取鼠标所在位置的矢量要素
    const feature = map.forEachFeatureAtPixel(evt.pixel, (f: any) => f);

    if (feature) {
      const data = feature.get('data');
      const coordinates = feature.getGeometry().getCoordinates();

      // 拼接图片列表（photoUrlsLink 多张以逗号分隔）
      const photos = String(data.photoUrlsLink ?? data.photoUrls ?? '')
        .split(',')
        .map((u: string) => u.trim())
        .filter(Boolean);
      const photoHtml = photos.length
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">${photos
            .map(
              (url: string) => `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;" />`
            )
            .join('')}</div>`
        : '';

      // 修改 DOM 显示详情
      popupContainerEl.innerHTML = `
        <div class="pop-card">
          <h4>${data.advertiseName ?? ''}</h4>
          ${photoHtml}
          <p><strong>市州：</strong>${data.cityName ?? ''}</p>
          <p><strong>区域：</strong>${data.districtName ?? ''}</p>
        </div>
      `;

      // 设置 Overlay 坐标并显示
      popupOverlay.setPosition(coordinates);
      // 鼠标变为手型
      map.getTargetElement().style.cursor = 'pointer';
    } else {
      // 鼠标移出时隐藏弹窗
      popupOverlay.setPosition(undefined);
      map.getTargetElement().style.cursor = '';
    }
  });
}
