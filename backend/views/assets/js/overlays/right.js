

import { createMenu } from "/assets/js/menus.js";
import "/assets/js/vehicleSummary.js";


var _f = [
    { name: 'Carburante', tab: 'tab_rightfuel', visible: true },
    { name: 'Autista', tab: 'tab_rightdrivers', visible: true },
]


var __f = [
    { name: 'Generiche', tab: 'tab_fuelgenerics', visible: true },
    { name: 'Per autista', tab: 'tab_fuelspecifics', visible: true }
]



function toggleScrollbar(show) {

    return;

    var scrollbar = document.querySelector('.scrub-bar');

    if (show) {
        scrollbar.classList.remove('collapsed');
        setTimeout(() => { scrollbar.classList.remove('shrink') }, 200)
    }
    else {
        scrollbar.classList.add('shrink');
        setTimeout(() => { scrollbar.classList.add('collapsed') }, 200)
    }

}


var menus = [
    {
        target: document.querySelector("#right_side_scroller_menu"), features: _f, index: 1, scroller: 'right_side_scroller', type: "%", callback: (idx) => {
            //Hey codex is me, this is the line where right section population shall be implemented. 
            try{
                const imei = window.currentAnalysisImei || window.currentVehicle?.imei || null;
                if(idx === 0 && window.rightPanelActions?.refreshFuel){
                    window.rightPanelActions.refreshFuel(imei);
                }
                if(idx === 1 && window.rightPanelActions?.refreshDriver){
                    window.rightPanelActions.refreshDriver(imei);
                }
            }catch(err){
                console.warn('[right.js] unable to refresh right panel data', err);
            }
        }
    },
    { target: document.querySelector("#fuel_stats_scroller_menu"), features: __f, index: 0, scroller: 'fuel_stats_scroller', type: "%", callback: (ev) => { } }
]

menus.forEach((m) => {
    var { target, features, index, scroller, type, callback } = m;
    createMenu(
        target,
        features,
        index,
        scroller,
        type,
        callback
    );
})



document.querySelector('a[data-role="right-close"]').addEventListener('click', (ev) => {
    document.querySelector('#right_section').classList.toggle('scrolled')
})

// Driver charts (test id, will be parameterised later)

// var __smf = [
//     { name: 'Statistiche', tab: 'tab_rightstats', visible: true },
//     { name: 'Carburante', tab: 'tab_rightfuel', visible: true },
//     { name: 'Autisti', tab: 'tab_rightdrivers', visible: true },
//     { name: 'Percorsi', tab: 'tab_righthistory', visible: true },
// ]

// createMenu(
//     document.querySelector('#right_side_scroller_menu'),
//     _smf,
//     1,
//     'right_side_scroller',
//     '%',
//     (ev) => {
//     }
// );
