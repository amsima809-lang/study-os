// University login themes. GENERATED from docs/research/*.json (high-confidence
// entries only) — colour names are as each university states them.
// swatch.source: "official" = hex published by the university,
// "converted" = computed from its official RGB/CMYK, "website" = the shade the
// university's own website uses for that colour (read 2026-11-14, see
// docs/research/colour-tuning.md), "approximate" = our match to the named
// colour. Only "official" is an official value.
export interface University {
  id: string;
  nameTh: string;
  nameEn: string;
  abbr: string;
  region: "bangkok" | "chiangmai";
  colourTh: string;
  colourEn: string;
  swatches: { hex: string; source: "official" | "converted" | "website" | "approximate" }[];
  /** ARCHIVED 2026-11-16: no longer shown; the files and credits are in docs/brand/campus-photos/. */
  photo?: { src: string; author: string; licence: string; page: string };
}

export const UNIVERSITIES: University[] = [
  {
    "id": "tu",
    "nameTh": "มหาวิทยาลัยธรรมศาสตร์",
    "nameEn": "Thammasat University",
    "abbr": "TU",
    "region": "bangkok",
    "colourTh": "สีเหลือง-แดง",
    "colourEn": "Yellow and red",
    "swatches": [
      {
        "hex": "#FFD13F",
        "source": "official"
      },
      {
        "hex": "#C3002F",
        "source": "official"
      }
    ],
    "photo": {
      "src": "/campus/tu.webp",
      "author": "Supanut Arunoprayote",
      "licence": "CC BY 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Dome_buildings,_TU_(I).jpg"
    }
  },
  {
    "id": "ku",
    "nameTh": "มหาวิทยาลัยเกษตรศาสตร์",
    "nameEn": "Kasetsart University",
    "abbr": "KU",
    "region": "bangkok",
    "colourTh": "สีเขียวใบไม้",
    "colourEn": "Leaf green (KU Green)",
    "swatches": [
      {
        "hex": "#006664",
        "source": "official"
      },
      {
        "hex": "#B2BB1E",
        "source": "official"
      }
    ],
    "photo": {
      "src": "/campus/ku.webp",
      "author": "David Supervid",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Kasetsart_University_Auditorium.jpg"
    }
  },
  {
    "id": "kmutt",
    "nameTh": "มหาวิทยาลัยเทคโนโลยีพระจอมเกล้าธนบุรี",
    "nameEn": "King Mongkut's University of Technology Thonburi",
    "abbr": "KMUTT",
    "region": "bangkok",
    "colourTh": "สีแสด-เหลือง",
    "colourEn": "Orange (saed) and yellow",
    "swatches": [
      {
        "hex": "#F04E23",
        "source": "converted"
      },
      {
        "hex": "#FFC233",
        "source": "converted"
      }
    ],
    "photo": {
      "src": "/campus/kmutt.webp",
      "author": "OraMAAG",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:KMUTT_Bangmod_1.jpg"
    }
  },
  {
    "id": "kmitl",
    "nameTh": "สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง",
    "nameEn": "King Mongkut's Institute of Technology Ladkrabang",
    "abbr": "KMITL",
    "region": "bangkok",
    "colourTh": "สีแสด",
    "colourEn": "Orange (saed)",
    "swatches": [
      {
        "hex": "#F16322",
        "source": "website"
      }
    ]
  },
  {
    "id": "sdu",
    "nameTh": "มหาวิทยาลัยสวนดุสิต",
    "nameEn": "Suan Dusit University",
    "abbr": "SDU",
    "region": "bangkok",
    "colourTh": "สีฟ้าน้ำทะเล",
    "colourEn": "Sea blue",
    "swatches": [
      {
        "hex": "#339BB9",
        "source": "website"
      }
    ]
  },
  {
    "id": "nmu",
    "nameTh": "มหาวิทยาลัยนวมินทราธิราช",
    "nameEn": "Navamindradhiraj University",
    "abbr": "NMU",
    "region": "bangkok",
    "colourTh": "สีเขียวเข้ม",
    "colourEn": "Dark green",
    "swatches": [
      {
        "hex": "#1B341A",
        "source": "official"
      }
    ],
    "photo": {
      "src": "/campus/nmu.webp",
      "author": "Medelam",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Navamindradhiraj_University_(2026).jpg"
    }
  },
  {
    "id": "mbu",
    "nameTh": "มหาวิทยาลัยมหามกุฏราชวิทยาลัย",
    "nameEn": "Mahamakut Buddhist University",
    "abbr": "MBU",
    "region": "bangkok",
    "colourTh": "สีแสด",
    "colourEn": "Orange (saed)",
    "swatches": [
      {
        "hex": "#F3690E",
        "source": "website"
      }
    ]
  },
  {
    "id": "cra",
    "nameTh": "ราชวิทยาลัยจุฬาภรณ์",
    "nameEn": "Chulabhorn Royal Academy",
    "abbr": "CRA",
    "region": "bangkok",
    "colourTh": "สีส้ม และ สีน้ำเงิน",
    "colourEn": "Orange and blue",
    "swatches": [
      {
        "hex": "#FF6B00",
        "source": "website"
      },
      {
        "hex": "#002F87",
        "source": "website"
      }
    ],
    "photo": {
      "src": "/campus/cra.webp",
      "author": "Athikhun.suw",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Chulabhorn_Royal_Academy_2022.jpg"
    }
  },
  {
    "id": "cdti",
    "nameTh": "สถาบันเทคโนโลยีจิตรลดา",
    "nameEn": "Chitralada Technology Institute",
    "abbr": "CDTI",
    "region": "bangkok",
    "colourTh": "สีเหลือง-ฟ้า",
    "colourEn": "Yellow and light blue",
    "swatches": [
      {
        "hex": "#FFD700",
        "source": "approximate"
      },
      {
        "hex": "#87CEEB",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "ru",
    "nameTh": "มหาวิทยาลัยรามคำแหง",
    "nameEn": "Ramkhamhaeng University",
    "abbr": "RU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน-ทอง",
    "colourEn": "Navy blue and gold",
    "swatches": [
      {
        "hex": "#191970",
        "source": "approximate"
      },
      {
        "hex": "#FFB700",
        "source": "website"
      }
    ],
    "photo": {
      "src": "/campus/ru.webp",
      "author": "Globe-trotter",
      "licence": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ramkhamhaeng_University_in_Bang_Kapi_District,_Bangkok,_Thailand.jpg"
    }
  },
  {
    "id": "stou",
    "nameTh": "มหาวิทยาลัยสุโขทัยธรรมาธิราช",
    "nameEn": "Sukhothai Thammathirat Open University",
    "abbr": "STOU",
    "region": "bangkok",
    "colourTh": "สีเขียว และ สีทอง",
    "colourEn": "Green and gold",
    "swatches": [
      {
        "hex": "#00653F",
        "source": "website"
      },
      {
        "hex": "#BDB76B",
        "source": "approximate"
      }
    ],
    "photo": {
      "src": "/campus/stou.webp",
      "author": "Tvcccp",
      "licence": "CC0",
      "page": "https://commons.wikimedia.org/wiki/File:Sukhothai_Thammathirat_Open_University,_Pakkret,_Nonthaburi_07.11.2025_(03).jpg"
    }
  },
  {
    "id": "dru",
    "nameTh": "มหาวิทยาลัยราชภัฏธนบุรี",
    "nameEn": "Dhonburi Rajabhat University",
    "abbr": "DRU",
    "region": "bangkok",
    "colourTh": "สีขาว-เหลือง (ขาวพิกุล / เหลืองลูกจัน)",
    "colourEn": "White and yellow",
    "swatches": [
      {
        "hex": "#FDB913",
        "source": "official"
      },
      {
        "hex": "#FFFFFF",
        "source": "official"
      }
    ]
  },
  {
    "id": "npru",
    "nameTh": "มหาวิทยาลัยราชภัฏนครปฐม",
    "nameEn": "Nakhon Pathom Rajabhat University",
    "abbr": "NPRU",
    "region": "bangkok",
    "colourTh": "สีชมพู สีแดง",
    "colourEn": "Pink and red",
    "swatches": [
      {
        "hex": "#F6B2C0",
        "source": "website"
      },
      {
        "hex": "#982220",
        "source": "website"
      }
    ]
  },
  {
    "id": "vru",
    "nameTh": "มหาวิทยาลัยราชภัฏวไลยอลงกรณ์ ในพระบรมราชูปถัมภ์",
    "nameEn": "Valaya Alongkorn Rajabhat University under the Royal Patronage",
    "abbr": "VRU",
    "region": "bangkok",
    "colourTh": "สีเขียว",
    "colourEn": "Green",
    "swatches": [
      {
        "hex": "#168504",
        "source": "website"
      }
    ]
  },
  {
    "id": "ssru",
    "nameTh": "มหาวิทยาลัยราชภัฏสวนสุนันทา",
    "nameEn": "Suan Sunandha Rajabhat University",
    "abbr": "SSRU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน สีชมพู",
    "colourEn": "Blue and pink",
    "swatches": [
      {
        "hex": "#535697",
        "source": "website"
      },
      {
        "hex": "#F06EAA",
        "source": "website"
      }
    ]
  },
  {
    "id": "rmutk",
    "nameTh": "มหาวิทยาลัยเทคโนโลยีราชมงคลกรุงเทพ",
    "nameEn": "Rajamangala University of Technology Krungthep",
    "abbr": "RMUTK",
    "region": "bangkok",
    "colourTh": "สีเขียว",
    "colourEn": "Green",
    "swatches": [
      {
        "hex": "#008000",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "rmutt",
    "nameTh": "มหาวิทยาลัยเทคโนโลยีราชมงคลธัญบุรี",
    "nameEn": "Rajamangala University of Technology Thanyaburi",
    "abbr": "RMUTT",
    "region": "bangkok",
    "colourTh": "สีน้ำเงินเข้ม (Royal Blue)",
    "colourEn": "Dark blue (Royal Blue)",
    "swatches": [
      {
        "hex": "#162B75",
        "source": "official"
      }
    ],
    "photo": {
      "src": "/campus/rmutt.webp",
      "author": "กสิณธร ราชโอรส",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B9%80%E0%B8%97%E0%B8%84%E0%B9%82%E0%B8%99%E0%B9%82%E0%B8%A5%E0%B8%A2%E0%B8%B5%E0%B8%A3%E0%B8%B2%E0%B8%8A%E0%B8%A1%E0%B8%87%E0%B8%84%E0%B8%A5%E0%B8%98%E0%B8%B1%E0%B8%8D%E0%B8%9A%E0%B8%B8%E0%B8%A3%E0%B8%B5_%E0%B8%AD.%E0%B8%84%E0%B8%A5%E0%B8%AD%E0%B8%87%E0%B8%AB%E0%B8%A5%E0%B8%A7%E0%B8%87_%E0%B8%88.%E0%B8%9B%E0%B8%97%E0%B8%B8%E0%B8%A1%E0%B8%98%E0%B8%B2%E0%B8%99%E0%B8%B5_rajamangala_university_of_technology_thanyaburi_(2).jpg"
    }
  },
  {
    "id": "rmutp",
    "nameTh": "มหาวิทยาลัยเทคโนโลยีราชมงคลพระนคร",
    "nameEn": "Rajamangala University of Technology Phra Nakhon",
    "abbr": "RMUTP",
    "region": "bangkok",
    "colourTh": "สีม่วง",
    "colourEn": "Purple",
    "swatches": [
      {
        "hex": "#662D91",
        "source": "converted"
      }
    ]
  },
  {
    "id": "rmutr",
    "nameTh": "มหาวิทยาลัยเทคโนโลยีราชมงคลรัตนโกสินทร์",
    "nameEn": "Rajamangala University of Technology Rattanakosin",
    "abbr": "RMUTR",
    "region": "bangkok",
    "colourTh": "สีแดงเลือดนก",
    "colourEn": "Vermilion red",
    "swatches": [
      {
        "hex": "#ED1C24",
        "source": "converted"
      }
    ]
  },
  {
    "id": "cut",
    "nameTh": "มหาวิทยาลัยคริสเตียน",
    "nameEn": "Christian University of Thailand",
    "abbr": "CUT",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน และสีทอง",
    "colourEn": "Blue and gold",
    "swatches": [
      {
        "hex": "#1C3A56",
        "source": "website"
      },
      {
        "hex": "#FFCB0C",
        "source": "website"
      }
    ]
  },
  {
    "id": "ptu",
    "nameTh": "มหาวิทยาลัยปทุมธานี",
    "nameEn": "Pathumthani University",
    "abbr": "PTU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน และสีชมพู",
    "colourEn": "Blue and pink",
    "swatches": [
      {
        "hex": "#0000FF",
        "source": "approximate"
      },
      {
        "hex": "#D82882",
        "source": "website"
      }
    ]
  },
  {
    "id": "hcu",
    "nameTh": "มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ",
    "nameEn": "Huachiew Chalermprakiet University",
    "abbr": "HCU",
    "region": "bangkok",
    "colourTh": "สีเหลืองทอง",
    "colourEn": "Golden yellow",
    "swatches": [
      {
        "hex": "#FFCB05",
        "source": "converted"
      }
    ]
  },
  {
    "id": "eau",
    "nameTh": "มหาวิทยาลัยอีสเทิร์นเอเชีย",
    "nameEn": "Eastern Asia University",
    "abbr": "EAU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน-ขาว",
    "colourEn": "Blue and white",
    "swatches": [
      {
        "hex": "#001F54",
        "source": "website"
      },
      {
        "hex": "#FFFFFF",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "sau",
    "nameTh": "มหาวิทยาลัยเอเชียอาคเนย์",
    "nameEn": "Southeast Asia University",
    "abbr": "SAU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน และ สีทอง",
    "colourEn": "Blue and gold",
    "swatches": [
      {
        "hex": "#011A43",
        "source": "website"
      },
      {
        "hex": "#FFD700",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "tru",
    "nameTh": "มหาวิทยาลัยธนบุรี",
    "nameEn": "Thonburi University",
    "abbr": "TRU",
    "region": "bangkok",
    "colourTh": "สีเหลืองทอง",
    "colourEn": "Golden yellow",
    "swatches": [
      {
        "hex": "#EBA009",
        "source": "website"
      }
    ]
  },
  {
    "id": "dpu",
    "nameTh": "มหาวิทยาลัยธุรกิจบัณฑิตย์",
    "nameEn": "Dhurakij Pundit University",
    "abbr": "DPU",
    "region": "bangkok",
    "colourTh": "สีม่วงและสีฟ้า",
    "colourEn": "Purple and sky blue",
    "swatches": [
      {
        "hex": "#691BFF",
        "source": "website"
      },
      {
        "hex": "#94C8FD",
        "source": "approximate"
      }
    ],
    "photo": {
      "src": "/campus/dpu.webp",
      "author": "Mrapisit",
      "licence": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2%E0%B8%98%E0%B8%B8%E0%B8%A3%E0%B8%81%E0%B8%B4%E0%B8%88%E0%B8%9A%E0%B8%B1%E0%B8%93%E0%B8%91%E0%B8%B4%E0%B8%95%E0%B8%A2%E0%B9%8C.jpg"
    }
  },
  {
    "id": "nbu",
    "nameTh": "มหาวิทยาลัยนอร์ทกรุงเทพ",
    "nameEn": "North Bangkok University",
    "abbr": "NBU",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน-ขาว",
    "colourEn": "Blue and white",
    "swatches": [
      {
        "hex": "#145996",
        "source": "website"
      },
      {
        "hex": "#FFFFFF",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "rsu",
    "nameTh": "มหาวิทยาลัยรังสิต",
    "nameEn": "Rangsit University",
    "abbr": "RSU",
    "region": "bangkok",
    "colourTh": "สีชมพู (บานเย็น) - สีฟ้า",
    "colourEn": "Magenta pink (ban yen) and sky blue",
    "swatches": [
      {
        "hex": "#EF3C63",
        "source": "website"
      },
      {
        "hex": "#2DB7F5",
        "source": "website"
      }
    ],
    "photo": {
      "src": "/campus/rsu.webp",
      "author": "VN.NguyenDucDuy",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Architecture_of_Rangsit_University.jpg"
    }
  },
  {
    "id": "bsu",
    "nameTh": "มหาวิทยาลัยกรุงเทพสุวรรณภูมิ",
    "nameEn": "Bangkok Suvarnabhumi University",
    "abbr": "BSU",
    "region": "bangkok",
    "colourTh": "สีแดง-ขาว-ทอง",
    "colourEn": "Red, white and gold",
    "swatches": [
      {
        "hex": "#C52D2F",
        "source": "website"
      },
      {
        "hex": "#FFFFFF",
        "source": "approximate"
      },
      {
        "hex": "#FFBD20",
        "source": "website"
      }
    ]
  },
  {
    "id": "tni",
    "nameTh": "สถาบันเทคโนโลยีไทย-ญี่ปุ่น",
    "nameEn": "Thai-Nichi Institute of Technology",
    "abbr": "TNI",
    "region": "bangkok",
    "colourTh": "สีน้ำเงิน และสีแดง",
    "colourEn": "Blue and red",
    "swatches": [
      {
        "hex": "#2D3691",
        "source": "website"
      },
      {
        "hex": "#D81638",
        "source": "website"
      }
    ],
    "photo": {
      "src": "/campus/tni.webp",
      "author": "Mj-bird",
      "licence": "CC BY-SA 3.0",
      "page": "https://commons.wikimedia.org/wiki/File:Thai-Nichi_Institute_of_Technology_(TNI)_,.jpg"
    }
  },
  {
    "id": "bpi",
    "nameTh": "สถาบันบัณฑิตพัฒนศิลป์",
    "nameEn": "Bunditpatanasilpa Institute of Fine Arts",
    "abbr": "BPI",
    "region": "bangkok",
    "colourTh": "สีเขียว",
    "colourEn": "Green",
    "swatches": [
      {
        "hex": "#045928",
        "source": "official"
      }
    ]
  },
  {
    "id": "stin",
    "nameTh": "สถาบันการพยาบาลศรีสวรินทิรา สภากาชาดไทย",
    "nameEn": "Srisavarindhira Thai Red Cross Institute of Nursing",
    "abbr": "STIN",
    "region": "bangkok",
    "colourTh": "สีแดงชาด",
    "colourEn": "Vermilion (Red Cross red)",
    "swatches": [
      {
        "hex": "#E32636",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "dtc",
    "nameTh": "วิทยาลัยดุสิตธานี",
    "nameEn": "Dusit Thani College",
    "abbr": "DTC",
    "region": "bangkok",
    "colourTh": "สีแดงอมน้ำตาล และสีขาว",
    "colourEn": "Maroon (brownish red) and white",
    "swatches": [
      {
        "hex": "#800000",
        "source": "approximate"
      },
      {
        "hex": "#FFFFFF",
        "source": "approximate"
      }
    ]
  },
  {
    "id": "cmu",
    "nameTh": "มหาวิทยาลัยเชียงใหม่",
    "nameEn": "Chiang Mai University",
    "abbr": "CMU",
    "region": "chiangmai",
    "colourTh": "สีม่วงดอกรัก",
    "colourEn": "Dok Rak purple",
    "swatches": [
      {
        "hex": "#9E76B4",
        "source": "converted"
      }
    ],
    "photo": {
      "src": "/campus/cmu.webp",
      "author": "Christophe95",
      "licence": "CC BY-SA 4.0",
      "page": "https://commons.wikimedia.org/wiki/File:Ang_Kaew_reservoir.jpg"
    }
  },
  {
    "id": "pyu",
    "nameTh": "มหาวิทยาลัยพายัพ",
    "nameEn": "Payap University",
    "abbr": "PYU",
    "region": "chiangmai",
    "colourTh": "สีฟ้า-สีขาว",
    "colourEn": "Sky blue and White",
    "swatches": [
      {
        "hex": "#007EFF",
        "source": "website"
      },
      {
        "hex": "#FFFFFF",
        "source": "approximate"
      }
    ]
  }
];
