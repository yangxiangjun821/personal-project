/* Shared by the globe landing and habitat explorer. Coordinates are fractions of the photograph.
   These are hypothetical human-impact scenarios, not claims about the photographed locations. */
(() => {
    'use strict';
    const scenes = {
        forest: {
            name: 'Forest', photo: 'forest/danum-canopy.jpg', focusY: .52,
            pressure: 'Logging & land-clearing fires',
            impact: 'Logging and clearing for farms break continuous forest into isolated patches. The lost canopy removes shelter, exposes soil to erosion and makes the remaining forest more vulnerable to fire.',
            source: [.52, .81], spread: [1.05, .8],
            stages: [
                [0, 'Intact rainforest', 'A continuous canopy provides shelter and connects wildlife populations.'],
                [.06, 'Logging access', 'Logging roads and machinery enter the forest; felled trunks are stacked beside the road.'],
                [.32, 'Forest clearance', 'Clearings widen around the access road. Tree removal fragments habitat and exposes soil to erosion.'],
                [.66, 'Smoke from burning', 'Burning cleared timber adds smoke and fine particles to the air above the damaged forest.']
            ],
            action: 'Protect connected forest, prevent illegal logging and avoid burning land to clear it.',
            credit: 'Base photo: Gido, CC BY 2.0. AI-edited human-impact illustration.'
        },
        ocean: {
            name: 'Ocean', photo: 'ocean/ningaloo-lagoon.jpg', focusY: .262,
            asset: 'ocean-litter',
            pressure: 'Dredging & beach litter',
            impact: 'Coastal dredging releases sediment that clouds the water and can smother reef life. Plastic waste and abandoned fishing gear collect on shore, where wildlife can swallow them or become entangled.',
            source: [.77, .39], spread: [.85, 1.55],
            stages: [
                [0, 'Clear lagoon', 'Clear coastal water allows sunlight to reach the reef below.'],
                [.06, 'Dredging begins', 'A dredging vessel disturbs the seabed, releasing a concentrated plume of sediment.'],
                [.32, 'Sediment spreads', 'Suspended mud moves away from the dredger into the lagoon and toward the beach.'],
                [.66, 'Turbid shallows', 'Sediment clouds the shallows while discarded bottles, bags, packaging and fishing nets accumulate along the tide line and among dune plants.']
            ],
            action: 'Control sediment from coastal works, prevent littering and collect discarded plastics and fishing gear from beaches.',
            credit: 'Base photo: W. Bulach, CC BY-SA 4.0. AI-edited illustration, CC BY-SA 4.0.'
        },
        freshwater: {
            name: 'Freshwater', photo: 'freshwater/okavango-floodplain.jpg', focusY: .322,
            pressure: 'Wastewater & fertiliser runoff',
            impact: 'Fertiliser runoff and poorly treated wastewater overload wetlands with nutrients, driving algal growth that can reduce oxygen in the water. Plastic waste also becomes trapped in channels and reeds.',
            source: [.16, .53], spread: [.85, 1.05],
            stages: [
                [0, 'Wetland channels', 'Channels and reed beds support aquatic plants, fish and wetland wildlife.'],
                [.06, 'Polluted discharge', 'A farm drain carries polluted water from cultivated land into a wetland channel.'],
                [.32, 'Nutrients accumulate', 'Fertiliser runoff and poorly treated wastewater can add excess nutrients that feed algal growth.'],
                [.66, 'Algae & trapped litter', 'Algal mats spread through the shallows and plastic catches in reeds. Decomposing algae can deplete dissolved oxygen.']
            ],
            action: 'Treat wastewater, reduce fertiliser losses and maintain vegetated buffers beside water.',
            credit: 'Base photo: Diego Delso, delso.photo, CC BY-SA 4.0. AI-edited illustration, CC BY-SA 4.0.'
        },
        island: {
            name: 'Island', photo: 'island/fernandina-shore.jpg', focusY: .283,
            pressure: 'Lost fishing gear & fuel leakage',
            impact: 'Fuel leaks contaminate coastal water and tide pools, while lost fishing gear and plastic waste build up along the shore. Wildlife can be poisoned, injured or trapped by this debris.',
            source: [.76, .3], spread: [1.1, .8],
            stages: [
                [0, 'Rocky island shore', 'Tide pools and coastal rocks provide feeding and resting places for island wildlife.'],
                [.06, 'Leaking vessel', 'Fuel escapes from a vessel and begins spreading across the coastal water.'],
                [.32, 'Pollution reaches shore', 'A thin oil film reaches tide pools; discarded plastics and fishing gear collect along the shore.'],
                [.66, 'Contaminated habitat', 'Oil residue and accumulated nets, ropes and packaging degrade the shoreline and create risks of ingestion and entanglement.']
            ],
            action: 'Prevent vessel fuel leaks, retrieve lost fishing gear and keep plastic waste out of the sea.',
            credit: 'Base photo: Andrew Turner, CC BY 2.0. AI-edited human-impact illustration.'
        },
        grassland: {
            name: 'Grassland', photo: 'grassland/serengeti-plains.jpg', focusY: .383,
            pressure: 'Land conversion & waste dumping',
            impact: 'Roads, farms and fences replace and divide open grassland, blocking wildlife routes and leaving soil vulnerable to erosion. Overgrazing and illegal dumping further degrade the remaining habitat.',
            source: [.68, .64], spread: [1.05, 1.05],
            stages: [
                [0, 'Open grassland', 'Native grassland provides feeding space and connected routes for wildlife.'],
                [.06, 'Road access', 'Vehicle tracks cut into the grassland, compacting soil and raising dust.'],
                [.32, 'Land conversion', 'Cultivated plots and fencing replace and divide habitat; intensive land use exposes soil to erosion.'],
                [.66, 'Dumped waste', 'Tyres, plastic sacks and mixed rubbish accumulate beside the road, contaminating and obstructing wildlife habitat.']
            ],
            action: 'Protect wildlife corridors, manage grazing pressure and prevent dumping on open land.',
            credit: 'Base photo: Harvey Barrison, CC BY-SA 2.0. AI-edited illustration, CC BY-SA 2.0.'
        }
    };
    for (const [key, scene] of Object.entries(scenes)) {
        scene.photo = `images/habitats/${scene.photo}`;
        scene.damage = `images/habitats/human-impact/${scene.asset || key}.png`;
    }
    window.pollutionScenes = scenes;
    window.pollutionStage = (scene, value) => scene.stages.filter(stage => value >= stage[0]).pop() || scene.stages[0];
})();
