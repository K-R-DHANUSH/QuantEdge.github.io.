/**
 * server.js — Elite Indian Stock Market Signal Engine v3.1
 *
 * Changes from v3.0:
 *  - BUY threshold lowered: 68 → 58 (more BUY signals in mixed markets)
 *  - Confluence HOLD demotion raised: score < 80 → score < 65 (less aggressive demotion)
 *  - Confluence requirement lowered: 5 → 4 indicators (easier to qualify)
 *  - Added "WEAK BUY" signal tier (score 50–57, confluence) shown separately
 *  - bestStock now also considers WEAK BUY if no strong BUY found
 *  - All v3.0 logic preserved (12 indicators, scoring, positions, batching)
 */

const express = require("express");
const axios   = require("axios");
const cors    = require("cors");
const cron    = require("node-cron");
const os      = require("os");

const {
  RSI, SMA, EMA, MACD,
  BollingerBands, Stochastic, ADX, ATR,
  OBV, WilliamsR, CCI, MFI,
} = require("technicalindicators");

const app = express();
app.use(cors());
app.use(express.json());

// ── Configuration ─────────────────────────────────────────────────────────────
const BATCH_SIZE  = 20;
const BATCH_DELAY = 350;
const CACHE_TTL   = 120_000;

// ── Full NSE Stock Universe ───────────────────────────────────────────────────
const NSE_STOCKS = [
  // ── Nifty 50 ──────────────────────────────────────────────────────────────
  "RELIANCE.NS","TCS.NS","HDFCBANK.NS","BHARTIARTL.NS","ICICIBANK.NS",
  "INFOSYS.NS","SBIN.NS","LICI.NS","HINDUNILVR.NS","ITC.NS",
  "BAJFINANCE.NS","LT.NS","HCLTECH.NS","KOTAKBANK.NS","MARUTI.NS",
  "AXISBANK.NS","ASIANPAINT.NS","SUNPHARMA.NS","TITAN.NS","WIPRO.NS",
  "NESTLEIND.NS","ADANIENT.NS","POWERGRID.NS","NTPC.NS","ULTRACEMCO.NS",
  "TECHM.NS","TATAMOTORS.NS","BAJAJFINSV.NS","ONGC.NS","INDUSINDBK.NS",
  "TATASTEEL.NS","COALINDIA.NS","HINDALCO.NS","ADANIPORTS.NS","JSWSTEEL.NS",
  "DRREDDY.NS","M%26M.NS","CIPLA.NS","BRITANNIA.NS","APOLLOHOSP.NS",
  "TATACONSUM.NS","GRASIM.NS","EICHERMOT.NS","BPCL.NS","DIVISLAB.NS",
  "SBILIFE.NS","HEROMOTOCO.NS","HDFCLIFE.NS","SHRIRAMFIN.NS","BAJAJ-AUTO.NS",

  // ── Nifty Next 50 ─────────────────────────────────────────────────────────
  "ADANIGREEN.NS","ADANIPOWER.NS","ADANITRANS.NS","AMBUJACEM.NS","AUROPHARMA.NS",
  "BANDHANBNK.NS","BERGEPAINT.NS","BOSCHLTD.NS","CANBK.NS","CHOLAFIN.NS",
  "COLPAL.NS","CONCOR.NS","DABUR.NS","DLF.NS","FEDERALBNK.NS",
  "GAIL.NS","GODREJCP.NS","GODREJPROP.NS","HAVELLS.NS","HDFCAMC.NS",
  "ICICIPRULI.NS","IDFCFIRSTB.NS","IOC.NS","IGL.NS","INDHOTEL.NS",
  "INDUSTOWER.NS","IRCTC.NS","JINDALSTEL.NS","LICHSGFIN.NS","LUPIN.NS",
  "MARICO.NS","MUTHOOTFIN.NS","NAUKRI.NS","NMDC.NS","OBEROIREAL.NS",
  "OFSS.NS","PAGEIND.NS","PAYTM.NS","PEL.NS","PIDILITIND.NS",
  "PNB.NS","RECLTD.NS","SAIL.NS","SIEMENS.NS","SRF.NS",
  "TATACOMM.NS","TRENT.NS","VEDL.NS","VOLTAS.NS","ZYDUSLIFE.NS",

  // ── Nifty Midcap 150 ──────────────────────────────────────────────────────
  "AARTIIND.NS","ABB.NS","ABCAPITAL.NS","ABFRL.NS","ACC.NS",
  "AIAENG.NS","ALKEM.NS","APLLTD.NS","ASTRAL.NS","ATUL.NS",
  "AUBANK.NS","BALRAMCHIN.NS","BANKBARODA.NS","BATAINDIA.NS","BEL.NS",
  "BHEL.NS","BIRLACORPN.NS","BLUEDART.NS","BSOFT.NS","CAMS.NS",
  "CANFINHOME.NS","CASTROLIND.NS","CEATLTD.NS","CHAMBLFERT.NS","CLEAN.NS",
  "COFORGE.NS","CROMPTON.NS","CUMMINSIND.NS","CYIENT.NS","DATAPATTNS.NS",
  "DEEPAKNTR.NS","DELTACORP.NS","EIDPARRY.NS","ELGIEQUIP.NS","EMAMILTD.NS",
  "ENGINERSIN.NS","ESCORTS.NS","EXIDEIND.NS","FINEORG.NS","FLUOROCHEM.NS",
  "FORTIS.NS","GLENMARK.NS","GNFC.NS","GRANULES.NS","GSPL.NS",
  "HAPPSTMNDS.NS","HFCL.NS","HONAUT.NS","ICICIGI.NS","IDBI.NS",
  "IPCALAB.NS","IRB.NS","IRCON.NS","ISEC.NS","JBCHEPHARM.NS",
  "JKCEMENT.NS","JKLAKSHMI.NS","JMFINANCIL.NS","JSL.NS","JSWENERGY.NS",
  "JUBLFOOD.NS","KALYANKJIL.NS","KARURVYSYA.NS","KEI.NS","KFINTECH.NS",
  "KPIL.NS","KRISHNAIND.NS","LAURUSLABS.NS","LAXMIMACH.NS","LEMONTREE.NS",
  "LINDEINDIA.NS","LTIM.NS","LTTS.NS","MAHABANK.NS","MAHINDCIE.NS",
  "MANAPPURAM.NS","MARICO.NS","MCX.NS","MEDANTA.NS","METROPOLIS.NS",
  "MFSL.NS","MINDTREE.NS","MIDHANI.NS","MOTILALOFS.NS","MPHASIS.NS",
  "MRPL.NS","NAVA.NS","NAVINFLUOR.NS","NBCC.NS","NCC.NS",
  "NHPC.NS","NLCINDIA.NS","NSLNISP.NS","OLECTRA.NS","PGHH.NS",
  "PHARMEASY.NS","PHOENIXLTD.NS","POLYCAB.NS","POLYMED.NS","PRESTIGE.NS",
  "PRINCEPIPE.NS","QUESS.NS","RADICO.NS","RAILTEL.NS","RAIN.NS",
  "RBLBANK.NS","REDINGTON.NS","RELAXO.NS","RITES.NS","ROSSARI.NS",
  "ROUTE.NS","RSYSTEMS.NS","SAREGAMA.NS","SCHAEFFLER.NS","SEQUENT.NS",
  "SHYAMMETL.NS","SJVN.NS","SKFINDIA.NS","SOBHA.NS","SPARC.NS",
  "STARHEALTH.NS","SUMICHEM.NS","SUNDARMFIN.NS","SUNDRMFAST.NS","SUPREMEIND.NS",
  "SURYAROSNI.NS","SUVENPHAR.NS","SYNGENE.NS","TANLA.NS","TASTYBITE.NS",
  "TATAELXSI.NS","TATAINVEST.NS","TCNSBRANDS.NS","TECHNO.NS","THERMAX.NS",
  "TIMKEN.NS","TITAGARH.NS","TTKPRESTIG.NS","TVSHLTD.NS","UBLLTD.NS",
  "UJJIVANSFB.NS","UNIONBANK.NS","UTIAMC.NS","VSTIND.NS","VGUARD.NS",
  "WELCORP.NS","WHIRLPOOL.NS","WIPRO.NS","WOCKPHARMA.NS","ZEEL.NS",
  "ZENTEC.NS","ZENSARTECH.NS","AARTIIND.NS","ZOMATO.NS","NYKAA.NS",

  // ── Nifty Smallcap (liquid) ───────────────────────────────────────────────
  "ACCELYA.NS","ACE.NS","AFFLE.NS","AGI.NS","AJANTPHARM.NS",
  "AKZOINDIA.NS","ALANKIT.NS","ALEMBICLTD.NS","ALKYLAMINE.NS","ALLCARGO.NS",
  "ANANTRAJ.NS","ANGELONE.NS","ANUPAM.NS","APLAPOLLO.NS","ARCHIDPLY.NS",
  "ARFIN.NS","ARVINDFASN.NS","ASAHIINDIA.NS","ASHIANA.NS","ASHOKLEY.NS",
  "ASTRAZEN.NS","AVADHSUGAR.NS","AVANTIFEED.NS","AYMSYNTEX.NS","AZAD.NS",
  "BAJAJCON.NS","BALMLAWRIE.NS","BANSALWIRE.NS","BASF.NS","BAYERCROP.NS",
  "BCG.NS","BECTORFOOD.NS","BFINVEST.NS","BIBCL.NS","BIKAJI.NS",
  "BLISSGVS.NS","BOROLTD.NS","BPCL.NS","BRIGADE.NS","BSE.NS",
  "BUTTERFLY.NS","CAMLINFINE.NS","CAPACITE.NS","CARBORUNIV.NS","CASTROLIND.NS",
  "CCL.NS","CENTURYPLY.NS","CENTURYTEX.NS","CESC.NS","CGPOWER.NS",
  "CHEMCON.NS","CHEMPLASTS.NS","CHENNPETRO.NS","CIGNITITEC.NS","CLICKTECH.NS",
  "CMSINFO.NS","COALINDIA.NS","CONFIPET.NS","CONTROLPR.NS","COSMOFILMS.NS",
  "CRAFTSMAN.NS","CRED.NS","CROMPTON.NS","CSLTD.NS","DCB.NS",
  "DECCANCE.NS","DELEXTRN.NS","DELHIVERY.NS","DEVYANI.NS","DHANI.NS",
  "DHANUKA.NS","DODLA.NS","DRREDDY.NS","DREDGING.NS","DYNPRO.NS",
  "EDELWEISS.NS","EIDPARRY.NS","EMKAY.NS","ENDURANCE.NS","EPIGRAL.NS",
  "EQUITASBNK.NS","ESABINDIA.NS","ETHOSLTD.NS","EUROBOND.NS","EXCEL.NS",
  "FLAIR.NS","FLEXI.NS","FLUOROCHEM.NS","FOODWORKS.NS","FORCEMOT.NS",
  "GABRIEL.NS","GALAXYSURF.NS","GARUDA.NS","GESHIP.NS","GIPCL.NS",
  "GIRNARFOOD.NS","GLAND.NS","GLOBALVECT.NS","GLS.NS","GMMPFAUDLR.NS",
  "GODFRYPHLP.NS","GOKEX.NS","GOLDIAM.NS","GOODLUCK.NS","GPPL.NS",
  "GREENPANEL.NS","GRINDWELL.NS","GRSE.NS","GUJGAS.NS","GUJSTATE.NS",
  "HARDWYN.NS","HARSHA.NS","HBL.NS","HFCL.NS","HIKAL.NS",
  "HILTON.NS","HINDCOPPER.NS","HINDPETRO.NS","HINDWARE.NS","HITACHIIND.NS",
  "HLVLTD.NS","HOMEFIRST.NS","HONASA.NS","HURON.NS","IBREALEST.NS",
  "ICIL.NS","IDFCFIRSTB.NS","IGPL.NS","IIFL.NS","IIFLSEC.NS",
  "ILFSTRANS.NS","IMAGICAA.NS","IMFA.NS","IMPAL.NS","INDGN.NS",
  "INDIGOPNTS.NS","INDOCO.NS","INDOSTAR.NS","INFOBEAN.NS","INPX.NS",
  "INTELLECT.NS","INTEQ.NS","IONEXCHANG.NS","IREDA.NS","ISGEC.NS",
  "ITI.NS","JAGRAN.NS","JAMNAAUTO.NS","JAYAGROGN.NS","JAYBPHARMA.NS",
  "JINDALSAW.NS","JKPAPER.NS","JMFINANCIL.NS","JPASSOCIAT.NS","JTLIND.NS",
  "JUBLINDS.NS","KANSAINER.NS","KARTIKAYAM.NS","KCP.NS","KERNEX.NS",
  "KIOCL.NS","KITEX.NS","KMCHEAL.NS","KNRCON.NS","KOKUYOCMLN.NS",
  "KPR.NS","KRBL.NS","KRIDHANINF.NS","KSCL.NS","KTKBANK.NS",
  "LALPATHLAB.NS","LAOPALA.NS","LGBBROSLTD.NS","LIBERTYSHOE.NS","LIKHITHA.NS",
  "LINKHOUSE.NS","LLOYDSENT.NS","LLOYDSENGG.NS","LMFHL.NS","LPDC.NS",
  "LUNA.NS","LUXIND.NS","LXCHEM.NS","MAGNASOUND.NS","MAHLOG.NS",
  "MAHSEAMLES.NS","MAPMYINDIA.NS","MARICOIND.NS","MASTEK.NS","MBAPL.NS",
  "MEDPLUS.NS","MEGH.NS","MEKINQ.NS","MELSTAR.NS","MFSL.NS",
  "MGLAMB.NS","MICROSTRAT.NS","MINDA.NS","MINDAIND.NS","MINEXCORP.NS",
  "MITCON.NS","MLTD.NS","MOLDIND.NS","MOLDTEK.NS","MOSCHIP.NS",
  "MPSLTD.NS","MRPL.NS","MTL.NS","MUKANDLTD.NS","MUNJALSHOW.NS",
  "NATCOPHARM.NS","NATHBIOGEN.NS","NAVINFLUO.NS","NAZARA.NS","NDGL.NS",
  "NEOGEN.NS","NETWORK18.NS","NEWGEN.NS","NGLFINECHM.NS","NIITLTD.NS",
  "NILKAMAL.NS","NIPPOBATRY.NS","NUCLEUS.NS","NUVAMA.NS","OLAELEC.NS",
  "OMAXE.NS","ONEPOINT.NS","ORIENTLTD.NS","ORIENTPPR.NS","ORISSAMINE.NS",
  "PALREDTEC.NS","PANSARI.NS","PARACABLES.NS","PARADEEP.NS","PATANJALI.NS",
  "PCJEWELLER.NS","PDPL.NS","PENIND.NS","PENINLAND.NS","PERSISTENT.NS",
  "PFIZER.NS","PHYNEXUS.NS","PILANIINVS.NS","PILOTSUN.NS","PINCON.NS",
  "PIRAMALENT.NS","PIXTRANS.NS","PLASTIBLENDS.NS","PODDARMENT.NS","POKARNA.NS",
  "POLSON.NS","POLYMED.NS","PONDDYCHI.NS","PRICOLLTD.NS","PRIMEIND.NS",
  "PRIORITY.NS","PRISM.NS","PROBIOTIC.NS","PROCTER.NS","PRUDENT.NS",
  "PSP.NS","PSUBNK.NS","PTC.NS","PUNJABCHEM.NS","PURVA.NS",
  "QUICKHEAL.NS","RAIN.NS","RAJESHEXPO.NS","RAJRATAN.NS","RALLIS.NS",
  "RAMCOIND.NS","RAMCOCEM.NS","RANEHOLDIN.NS","RATNAMANI.NS","RAYMOND.NS",
  "RCPCL.NS","RECLTD.NS","REDTAPE.NS","RFCL.NS","RHIM.NS",
  "RIIL.NS","RINFRA.NS","RITCO.NS","RKDL.NS","RPGLIFE.NS",
  "RPOWER.NS","RSWM.NS","RTNINDIA.NS","SAFARI.NS","SAKSOFT.NS",
  "SALSTEEL.NS","SANDESH.NS","SANGHIIND.NS","SANOFI.NS","SAPPHIRE.NS",
  "SARDAEN.NS","SASKEN.NS","SATYAMFORG.NS","SBFC.NS","SBGLP.NS",
  "SBICARD.NS","SCHAND.NS","SCHNEIDER.NS","SEPOWER.NS","SEQUENT.NS",
  "SETCO.NS","SFL.NS","SGIL.NS","SHARDAMOTR.NS","SHAREINDIA.NS",
  "SHILPAMED.NS","SHIVALIK.NS","SHREDIGCEM.NS","SHREEPUSHK.NS","SHRIRAMCIT.NS",
  "SILVERTO.NS","SINTERCAST.NS","SITINET.NS","SMSPHARMA.NS","SODFLEX.NS",
  "SOFTSOL.NS","SONACOMS.NS","SOUTHBANK.NS","SPANDANA.NS","SPECTRANET.NS",
  "SSWL.NS","STCINDIA.NS","STEELXIND.NS","STERTOOLS.NS","STLTECH.NS",
  "SUBEXLTD.NS","SUBROS.NS","SUKHJITS.NS","SUMIT.NS","SUMILON.NS",
  "SUNCLAYLTD.NS","SUNDARMHLD.NS","SUNDRAM.NS","SUNFLAG.NS","SUNPHARMA.NS",
  "SUNTECK.NS","SUPRAJIT.NS","SURYODAY.NS","SUTLEJTEX.NS","SWELECTES.NS",
  "SWSOLAR.NS","SYMPHONY.NS","TARC.NS","TATACHEM.NS","TATACOFFEE.NS",
  "TATAPOWER.NS","TEAMLEASE.NS","TEXINFRA.NS","TFCILTD.NS","THYROCARE.NS",
  "TINPLATE.NS","TIRUMALCHM.NS","TORNTPHARM.NS","TORNTPOWER.NS","TPTC.NS",
  "TREJHARA.NS","TRITON.NS","TRIVENI.NS","TTK.NS","TV18BRDCST.NS",
  "TVSSCS.NS","TVTODAY.NS","UCAL.NS","UCOBANK.NS","UFLEX.NS",
  "UGROCAP.NS","UPL.NS","UTKARSHBNK.NS","V2RETAIL.NS","VAIBHAVGBL.NS",
  "VALDEL.NS","VARROC.NS","VARSA.NS","VBLTD.NS","VEEFIN.NS",
  "VERITAS.NS","VESUVIUS.NS","VINATIORGA.NS","VINCOELEC.NS","VINDHYATEL.NS",
  "VIPCLOTHNG.NS","VIPIND.NS","VISCO.NS","VISHAL.NS","VLSFINANCE.NS",
  "VMART.NS","VOLTAMP.NS","VSTIL.NS","WESTERNIND.NS","WESTLIFE.NS",
  "WHEELS.NS","WINDLAS.NS","WINFO.NS","WIPRO.NS","WONDERLA.NS",
  "XCHANGING.NS","XPRO.NS","YAARI.NS","YATHARTH.NS","YUKEN.NS",
  "ZENSARTECH.NS","ZFCVINDIA.NS","ZODIACLOTH.NS","ZUARI.NS",

  // ── Banking & Finance Extra ───────────────────────────────────────────────
  "ABSL.NS","ACCELYA.NS","ADITYA.NS","ALANKIT.NS","ANDHRABAN.NS",
  "ANGELONE.NS","APLAPOLLO.NS","APTECHT.NS","ARMAN.NS","AROHA.NS",
  "ARTSONIG.NS","ASSETWORKS.NS","ATUL.NS","AVGOLD.NS","AVTNPL.NS",

  // ── IT & Tech Extra ───────────────────────────────────────────────────────
  "CIGNITITEC.NS","COFORGE.NS","CYIENT.NS","DATAMATICS.NS","ECLERX.NS",
  "EXPLEO.NS","FIRSTSOURC.NS","GALAXYSURF.NS","GTPL.NS","HCL.NS",
  "HEXAWARE.NS","INTELLECT.NS","IOT.NS","ISEC.NS","KPITTECH.NS",
  "MASTEK.NS","MINDTREE.NS","MPHASIS.NS","MRPL.NS","NIIT.NS",
  "NUCLEUS.NS","OFSS.NS","PERSISTENT.NS","RATEGAIN.NS","ROUTE.NS",
  "SECLABS.NS","SONATA.NS","TANLA.NS","TATAELXSI.NS","TECHNO.NS",
  "TRIGYN.NS","TTML.NS","UNISON.NS","UTSSTSYSL.NS","VAKRANGEE.NS",
  "VIMTALABS.NS","WIPRO.NS","XCHANGING.NS","XPRO.NS","ZENSAR.NS",

  // ── Pharma Extra ──────────────────────────────────────────────────────────
  "ABBOTINDIA.NS","AJANTPHARM.NS","ALEMBICLTD.NS","ALKEM.NS","APLLTD.NS",
  "ASTRAZEN.NS","AUROPHARMA.NS","BIPCL.NS","BLISSGVS.NS","CADILAHC.NS",
  "CAPLIPOINT.NS","CIPLA.NS","DIVI.NS","DRREDDY.NS","ERIS.NS",
  "GLAND.NS","GLENMARK.NS","GRANULES.NS","HIKAL.NS","IPCALAB.NS",
  "JBCHEPHARM.NS","JUBILANT.NS","KANSAINER.NS","LAURUSLABS.NS","LUPIN.NS",
  "NATCOPHARM.NS","NAVINFLUOR.NS","NGLFINECHM.NS","PFIZER.NS","RADICO.NS",
  "RAIN.NS","SANOFI.NS","SEQUENT.NS","SUNPHARMA.NS","SUVEN.NS",
  "TORNTPHARM.NS","UNICHEM.NS","VINATIORGA.NS","WOCKPHARMA.NS","ZYDUSLIFE.NS",

  // ── Infrastructure & Energy ───────────────────────────────────────────────
  "ADANIENSOL.NS","ADANIGAS.NS","ADANIGREEN.NS","ADANIPORTS.NS","ADANIPOWER.NS",
  "ADANITRANS.NS","AEGISLOG.NS","BHEL.NS","BPCL.NS","CESC.NS",
  "CGPOWER.NS","ENGINERSIN.NS","GMRINFRA.NS","GPPL.NS","GUJGAS.NS",
  "HINDPETRO.NS","IOC.NS","IGL.NS","IRB.NS","IRCON.NS",
  "IREDA.NS","IRFC.NS","JSWENERGY.NS","KEC.NS","NHPC.NS",
  "NLCINDIA.NS","NTPC.NS","ONGC.NS","PETRONET.NS","PFC.NS",
  "POWERGRID.NS","PTC.NS","RECLTD.NS","RINFRA.NS","RPOWER.NS",
  "SAIL.NS","SJVN.NS","SUNCLAYLTD.NS","SWSOLAR.NS","TATAPOWER.NS",
  "TORNTPOWER.NS","UJJAIN.NS","UPL.NS","VEDL.NS","YESBANK.NS",
];

// ── BSE Stocks ────────────────────────────────────────────────────────────────
const BSE_STOCKS = [
  "RELIANCE.BO","TCS.BO","HDFCBANK.BO","ICICIBANK.BO","INFOSYS.BO",
  "SBIN.BO","BHARTIARTL.BO","ITC.BO","HINDUNILVR.BO","BAJFINANCE.BO",
  "LT.BO","HCLTECH.BO","KOTAKBANK.BO","MARUTI.BO","AXISBANK.BO",
  "ASIANPAINT.BO","SUNPHARMA.BO","TITAN.BO","WIPRO.BO","NESTLEIND.BO",
  "POWERGRID.BO","NTPC.BO","TATAMOTORS.BO","BAJAJFINSV.BO","ONGC.BO",
  "TATASTEEL.BO","COALINDIA.BO","HINDALCO.BO","ADANIPORTS.BO","JSWSTEEL.BO",
  "DRREDDY.BO","CIPLA.BO","BRITANNIA.BO","APOLLOHOSP.BO","TATACONSUM.BO",
  "GRASIM.BO","EICHERMOT.BO","BPCL.BO","SBILIFE.BO","HEROMOTOCO.BO",
  "HDFCLIFE.BO","BAJAJ-AUTO.BO","ADANIGREEN.BO","TECHM.BO","INDUSINDBK.BO",
  "DIVISLAB.BO","M%26M.BO","SHRIRAMFIN.BO","AMBUJACEM.BO","DLF.BO",
  "GODREJCP.BO","HAVELLS.BO","PIDILITIND.BO","SIEMENS.BO","TRENT.BO",
  "MARICO.BO","DABUR.BO","COLPAL.BO","NAUKRI.BO","OBEROIREAL.BO",
  "GAIL.BO","IRCTC.BO","RECLTD.BO","IDFCFIRSTB.BO","BANDHANBNK.BO",
  "ABCAPITAL.BO","MUTHOOTFIN.BO","LICHSGFIN.BO","SAIL.BO","NMDC.BO",
  "FEDERALBNK.BO","CANBK.BO","PNB.BO","BANKBARODA.BO","UNIONBANK.BO",
  "IOC.BO","VEDL.BO","TATAPOWER.BO","CHOLAFIN.BO","BERGEPAINT.BO",
  "PAGEIND.BO","BOSCHLTD.BO","CONCOR.BO","ZYDUSLIFE.BO","LUPIN.BO",
  "TORNTPHARM.BO","AUROPHARMA.BO","BIOCON.BO","CADILAHC.BO","ALKEM.BO",
  "GLAXO.BO","ABBOTINDIA.BO","PFIZER.BO","SANOFI.BO","ASTRAZEN.BO",
  "TATAELXSI.BO","MPHASIS.BO","LTIM.BO","LTTS.BO","PERSISTENT.BO",
  "COFORGE.BO","HAPPSTMNDS.BO","ZOMATO.BO","NYKAA.BO","PAYTM.BO",
  "DELHIVERY.BO","POLICYBZR.BO","DEVYANI.BO","WESTLIFE.BO","JUBLFOOD.BO",
  "KALYANKJIL.BO","TRENT.BO","SHOPERSTOP.BO","VMART.BO","PVRINOX.BO",
  "INOXWIND.BO","IREDA.BO","IRFC.BO","IRCON.BO","NHPC.BO",
  "SJVN.BO","NTPC.BO","ADANIPOWER.BO","ADANITRANS.BO","ADANIGAS.BO",
  "CESC.BO","TORNTPOWER.BO","JSWENERGY.BO","CGPOWER.BO","BHEL.BO",
  "ENGINERSIN.BO","KEC.BO","ABB.BO","SIEMENS.BO","HONAUT.BO",
  "GRINDWELL.BO","ELGIEQUIP.BO","TIMKEN.BO","SKFINDIA.BO","SCHAEFFLER.BO",
  "AMARAJABAT.BO","EXIDEIND.BO","SUNDRMFAST.BO","GABRIEL.BO","SUPRAJIT.BO",
  "MINDAIND.BO","MINDA.BO","ENDURANCE.BO","MOTHERSON.BO","BOSCHLTD.BO",
  "HEROMOTOCO.BO","BAJAJ-AUTO.BO","EICHERMOT.BO","TVSMOTORS.BO","ESCORTS.BO",
  "MAHINDCIE.BO","FORCEMOT.BO","OLECTRA.BO","IOCHCL.BO","CPCL.BO",
  "MRPL.BO","BPCL.BO","IOC.BO","HINDPETRO.BO","PETRONET.BO",
  "GUJGAS.BO","IGL.BO","GSPL.BO","GAIL.BO","ONGC.BO",
  "RELIANCE.BO","HPCL.BO","MGL.BO","INDRAPRASTHA.BO","ATGL.BO",
  "SUPREMEIND.BO","ASTRAL.BO","APLAPOLLO.BO","POLYCAB.BO","KEI.BO",
  "HAVELLS.BO","VOLTAS.BO","BLUESTAR.BO","WHIRLPOOL.BO","CROMPTON.BO",
  "ORIENTLTD.BO","SYMPHONY.BO","VGUARD.BO","BAJAJELECTR.BO","FINOLEX.BO",
  "ULTRACEMCO.BO","AMBUJACEM.BO","ACC.BO","SHREECEM.BO","RAMCOCEM.BO",
  "JKCEMENT.BO","BIRLACORPN.BO","HEIDELBERG.BO","DALMIA.BO","INDIACEM.BO",
  "TATASTEEL.BO","JSWSTEEL.BO","HINDALCO.BO","NATIONALUM.BO","VEDL.BO",
  "COALINDIA.BO","NMDC.BO","SAIL.BO","JINDALSTEL.BO","JSPL.BO",
];

const STOCKS = [...new Set([...NSE_STOCKS, ...BSE_STOCKS])];
console.log(`📊 Total stock universe: ${STOCKS.length} symbols`);

// ── Open Positions ────────────────────────────────────────────────────────────
const openPositions = {};

// ── Signal Cache ──────────────────────────────────────────────────────────────
let signalCache  = null;
let partialCache = null;
let cacheTime    = 0;
let isScanning   = false;
let scanProgress = { done: 0, total: STOCKS.length, started: null };

// ── Market Hours (IST) ────────────────────────────────────────────────────────
function isMarketOpen() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 5.5 * 3600000);
  const h = ist.getHours(), m = ist.getMinutes(), d = ist.getDay();
  if (d === 0 || d === 6) return false;
  return (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m <= 30));
}

function getISTTime() {
  return new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Fetch OHLCV from Yahoo Finance ────────────────────────────────────────────
async function fetchStockData(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`;
    const res = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      timeout: 8000,
    });

    const result     = res.data.chart.result[0];
    const q          = result.indicators.quote[0];
    const timestamps = result.timestamp || [];

    const rows = timestamps
      .map((t, i) => ({
        t,
        c: q.close[i],
        h: q.high[i],
        l: q.low[i],
        v: q.volume[i] ?? 0,
        o: q.open[i],
      }))
      .filter(r => r.c != null && r.h != null && r.l != null);

    return {
      closes:     rows.map(r => r.c),
      highs:      rows.map(r => r.h),
      lows:       rows.map(r => r.l),
      volumes:    rows.map(r => r.v),
      opens:      rows.map(r => r.o),
      timestamps: rows.map(r => r.t),
    };
  } catch (err) {
    return null;
  }
}

// ── VWAP Calculation ──────────────────────────────────────────────────────────
function calculateVWAP(closes, highs, lows, volumes) {
  let cumVolume = 0, cumTPV = 0;
  const vwap = [];
  for (let i = 0; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumVolume += volumes[i] || 0;
    cumTPV    += tp * (volumes[i] || 0);
    vwap.push(cumVolume > 0 ? cumTPV / cumVolume : null);
  }
  return vwap;
}

// ── Projected Sell Time ───────────────────────────────────────────────────────
function projectSellTime(currentPrice, target, atr, periodMinutes = 14) {
  if (!target || !atr || atr === 0) return null;
  const gap            = Math.abs(target - currentPrice);
  const pricePerMinute = atr / periodMinutes;
  if (pricePerMinute === 0) return null;
  const minutesNeeded  = Math.ceil(gap / pricePerMinute);
  if (minutesNeeded > 240) return null;
  const sell = new Date(Date.now() + minutesNeeded * 60000);
  return sell.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour:     "2-digit",
    minute:   "2-digit",
  });
}

// ── Core Signal Engine — 12 Indicators ───────────────────────────────────────
// v3.1 changes:
//   • confluence threshold: >= 5  →  >= 4
//   • BUY score threshold:  >= 68 →  >= 58
//   • HOLD demotion guard:  < 80  →  < 65
//   • New "WEAK BUY" signal for borderline bullish stocks
function generateSignal(closes, highs, lows, volumes, opens) {
  const prices = closes;
  const hs = highs, ls = lows, vs = volumes;
  if (prices.length < 30) return null;
  const last = prices.at(-1);

  const rsiArr = RSI.calculate({ values: prices, period: 14 });
  const rsi    = rsiArr.at(-1);
  const sma10  = SMA.calculate({ values: prices, period: 10 }).at(-1);
  const sma20  = SMA.calculate({ values: prices, period: 20 }).at(-1);
  const sma50  = prices.length >= 50 ? SMA.calculate({ values: prices, period: 50 }).at(-1) : null;
  const ema9   = EMA.calculate({ values: prices, period: 9 }).at(-1);
  const ema21  = EMA.calculate({ values: prices, period: 21 }).at(-1);

  const macdArr = MACD.calculate({
    values: prices, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const macd     = macdArr.at(-1);
  const macdPrev = macdArr.at(-2);

  const bbArr = BollingerBands.calculate({ values: prices, period: 20, stdDev: 2 });
  const bb    = bbArr.at(-1);

  let stoch = null;
  if (hs.length >= 14) {
    const stochArr = Stochastic.calculate({ high: hs, low: ls, close: prices, period: 14, signalPeriod: 3 });
    stoch = stochArr.at(-1);
  }

  let adx = null;
  if (hs.length >= 14) {
    const adxArr = ADX.calculate({ high: hs, low: ls, close: prices, period: 14 });
    adx = adxArr.at(-1);
  }

  let atr = null;
  if (hs.length >= 14) {
    const atrArr = ATR.calculate({ high: hs, low: ls, close: prices, period: 14 });
    atr = atrArr.at(-1);
  }

  const obvArr  = OBV.calculate({ close: prices, volume: vs });
  const obvNow  = obvArr.at(-1);
  const obvPrev = obvArr.at(-2);
  const priceUp = prices.at(-1) > prices.at(-2);

  const wrArr = WilliamsR.calculate({ high: hs, low: ls, close: prices, period: 14 });
  const wr    = wrArr.at(-1);

  let cci = null;
  if (hs.length >= 20) {
    const cciArr = CCI.calculate({ high: hs, low: ls, close: prices, period: 20 });
    cci = cciArr.at(-1);
  }

  let mfi = null;
  if (hs.length >= 14 && vs.length >= 14) {
    const mfiArr = MFI.calculate({ high: hs, low: ls, close: prices, volume: vs, period: 14 });
    mfi = mfiArr.at(-1);
  }

  const vwapArr = calculateVWAP(closes, highs, lows, volumes);
  const vwapNow = vwapArr.filter(Boolean).at(-1);
  const vwapDev = vwapNow ? ((last - vwapNow) / vwapNow) * 100 : null;

  let bullScore = 0, bearScore = 0, maxScore = 0;
  const reasons = [];

  // RSI (2)
  maxScore += 2;
  if (rsi < 30)      { bullScore += 2; reasons.push(`RSI Oversold (${Math.round(rsi)})`); }
  else if (rsi < 45) { bullScore += 1; reasons.push("RSI Recovering"); }
  else if (rsi > 70) { bearScore += 2; reasons.push(`RSI Overbought (${Math.round(rsi)})`); }
  else if (rsi > 60) { bearScore += 1; }

  // SMA (3)
  maxScore += 3;
  if (last > sma10) bullScore += 1;
  if (last > sma20) { bullScore += 1; reasons.push("Above SMA20"); }
  if (sma50 && last > sma50) { bullScore += 1; reasons.push("Above SMA50"); }
  if (last < sma10) bearScore += 1;
  if (last < sma20) bearScore += 1;
  if (sma50 && last < sma50) bearScore += 1;

  // EMA (1.5)
  maxScore += 1.5;
  if (ema9 > ema21 && last > ema21)      { bullScore += 1.5; reasons.push("EMA Bullish Cross"); }
  else if (ema9 < ema21 && last < ema21) { bearScore += 1.5; reasons.push("EMA Bearish Cross"); }

  // MACD (2)
  maxScore += 2;
  if (macd && macdPrev) {
    if (macd.MACD > macd.signal)   bullScore += 1;
    if (macd.histogram > 0 && macdPrev.histogram <= 0) { bullScore += 1; reasons.push("MACD Bullish Crossover"); }
    if (macd.MACD < macd.signal)   bearScore += 1;
    if (macd.histogram < 0 && macdPrev.histogram >= 0) { bearScore += 1; reasons.push("MACD Bearish Crossover"); }
  }

  // Bollinger (1.5)
  maxScore += 1.5;
  if (bb) {
    if (last < bb.lower)                          { bullScore += 1.5; reasons.push("BB Oversold Squeeze"); }
    else if (last < bb.middle && last > bb.lower) { bullScore += 0.5; }
    else if (last > bb.upper)                     { bearScore += 1.5; reasons.push("BB Overbought"); }
    else if (last > bb.middle && last < bb.upper) { bearScore += 0.5; }
  }

  // Stochastic (1.5)
  maxScore += 1.5;
  if (stoch) {
    if (stoch.k < 20)      { bullScore += 1.5; reasons.push("Stochastic Oversold"); }
    else if (stoch.k > 80) { bearScore += 1.5; reasons.push("Stochastic Overbought"); }
  }

  // Williams %R (1)
  maxScore += 1;
  if (wr < -80)      bullScore += 1;
  else if (wr > -20) bearScore += 1;

  // OBV (1.5)
  maxScore += 1.5;
  if (obvNow > obvPrev && priceUp)       { bullScore += 1.5; reasons.push("Volume Confirms Upside"); }
  else if (obvNow < obvPrev && !priceUp) { bearScore += 1.5; reasons.push("Volume Confirms Downside"); }

  // CCI (1.5)
  maxScore += 1.5;
  if (cci !== null) {
    if (cci < -100)     { bullScore += 1.5; reasons.push("CCI Oversold"); }
    else if (cci > 100) { bearScore += 1.5; }
  }

  // MFI (2)
  maxScore += 2;
  if (mfi !== null) {
    if (mfi < 20)      { bullScore += 2; reasons.push("MFI Oversold (Volume Weighted)"); }
    else if (mfi < 40) { bullScore += 1; }
    else if (mfi > 80) { bearScore += 2; reasons.push("MFI Overbought"); }
    else if (mfi > 60) { bearScore += 1; }
  }

  // VWAP (2)
  maxScore += 2;
  if (vwapDev !== null) {
    if (vwapDev < -1.5)      { bullScore += 2; reasons.push("Below VWAP (Institutional Buy Zone)"); }
    else if (vwapDev < -0.5) { bullScore += 1; reasons.push("Below VWAP"); }
    else if (vwapDev > 1.5)  { bearScore += 2; reasons.push("Extended Above VWAP"); }
    else if (vwapDev > 0.5)  { bearScore += 1; }
  }

  const adxVal     = adx ? adx.adx : 0;
  const trendBonus = adxVal >= 40 ? 1.3 : adxVal >= 25 ? 1.15 : adxVal >= 15 ? 1.0 : 0.85;
  const rawScore   = maxScore > 0 ? (bullScore / maxScore) * 100 : 50;
  const score      = Math.min(100, Math.round(rawScore * trendBonus));

  // ── v3.1: Confluence threshold lowered 5 → 4 ─────────────────────────────
  const confluence = Math.max(bullScore, bearScore) >= 4;

  // ── v3.1: BUY threshold lowered 68 → 58 ──────────────────────────────────
  let signal = "HOLD";
  if (score >= 58)      signal = "BUY";
  else if (score <= 32) signal = "SELL";

  // ── v3.1: Demotion guard raised 80 → 65 (less aggressive HOLD demotion) ──
  if (signal === "BUY"  && !confluence && score < 65) signal = "HOLD";
  if (signal === "SELL" && !confluence && score > 20) signal = "HOLD";

  // ── v3.1: WEAK BUY tier — borderline bullish, worth watching ─────────────
  // Stocks scoring 50–57 with any bullish lean become "WEAK BUY"
  if (signal === "HOLD" && score >= 50 && bullScore > bearScore) {
    signal = "WEAK BUY";
  }

  const stopLoss = atr ? +(last - 1.5 * atr).toFixed(2) : null;
  const target   = atr ? +(last + 2.5 * atr).toFixed(2) : null;
  const projectedSellTime = (signal === "BUY" || signal === "WEAK BUY")
    ? projectSellTime(last, target, atr)
    : null;

  return {
    signal, score, bullScore, bearScore,
    reasons: reasons.slice(0, 6),
    stopLoss, target,
    rsi:           rsi  ? Math.round(rsi)    : null,
    mfi:           mfi  ? Math.round(mfi)    : null,
    cci:           cci  ? Math.round(cci)    : null,
    atr:           atr  ? +atr.toFixed(2)    : null,
    trendStrength: adx  ? Math.round(adxVal) : null,
    vwapDeviation: vwapDev ? +vwapDev.toFixed(2) : null,
    vwap:          vwapNow ? +vwapNow.toFixed(2)  : null,
    projectedSellTime,
    confluence,
    macdHistogram: macd  ? +macd.histogram.toFixed(2) : null,
    stochK:        stoch ? Math.round(stoch.k)        : null,
  };
}

// ── Position Tracker ──────────────────────────────────────────────────────────
function checkExitCondition(symbol, currentPrice, analysis) {
  const pos = openPositions[symbol];

  if (!pos) {
    // Open position on BUY or WEAK BUY
    if (analysis.signal === "BUY" || analysis.signal === "WEAK BUY") {
      openPositions[symbol] = {
        entryPrice:        currentPrice,
        entryTime:         getISTTime(),
        target:            analysis.target,
        stopLoss:          analysis.stopLoss,
        projectedSellTime: analysis.projectedSellTime,
        signalType:        analysis.signal,
      };
      return { action: analysis.signal, isNew: true };
    }
    return { action: analysis.signal, isNew: false };
  }

  const hitTarget   = analysis.target   && currentPrice >= analysis.target;
  const hitStopLoss = analysis.stopLoss && currentPrice <= analysis.stopLoss;
  const signalSell  = analysis.signal === "SELL";

  if (hitTarget || hitStopLoss || signalSell) {
    const pl = ((currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2);
    delete openPositions[symbol];
    return {
      action: "SELL", isNew: true,
      reason:     hitTarget ? "🎯 Target Hit" : hitStopLoss ? "🛑 Stop-Loss Hit" : "📉 Signal Reversed",
      profitLoss: pl,
      entryPrice: pos.entryPrice,
      entryTime:  pos.entryTime,
    };
  }

  return { action: pos.signalType || "BUY", isNew: false, position: pos };
}

// ── Core Scanner — Batched Parallel ──────────────────────────────────────────
async function runFullScan() {
  if (isScanning) return;
  isScanning   = true;
  scanProgress = { done: 0, total: STOCKS.length, started: getISTTime() };

  const results = [];
  const batches = [];
  for (let i = 0; i < STOCKS.length; i += BATCH_SIZE) {
    batches.push(STOCKS.slice(i, i + BATCH_SIZE));
  }

  console.log(`🔍 Scanning ${STOCKS.length} stocks in ${batches.length} batches of ${BATCH_SIZE}...`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const data = await fetchStockData(symbol);
          if (!data || data.closes.length < 30) return null;

          const analysis = generateSignal(data.closes, data.highs, data.lows, data.volumes, data.opens);
          if (!analysis) return null;

          const currentPrice = data.closes.at(-1);
          const exitInfo     = checkExitCondition(symbol, currentPrice, analysis);
          const pos          = openPositions[symbol];

          return {
            symbol,
            exchange:      symbol.endsWith(".NS") ? "NSE" : "BSE",
            price:         +currentPrice.toFixed(2),
            signal:        exitInfo.action,
            score:         analysis.score,
            reasons:       analysis.reasons,
            stopLoss:      analysis.stopLoss,
            target:        analysis.target,
            rsi:           analysis.rsi,
            mfi:           analysis.mfi,
            cci:           analysis.cci,
            trendStrength: analysis.trendStrength,
            vwap:          analysis.vwap,
            vwapDeviation: analysis.vwapDeviation,
            macdHistogram: analysis.macdHistogram,
            stochK:        analysis.stochK,
            atr:           analysis.atr,
            confluence:    analysis.confluence,
            projectedSellTime: analysis.projectedSellTime || pos?.projectedSellTime || null,
            isNewSignal:   exitInfo.isNew,
            exitReason:    exitInfo.reason     || null,
            profitLoss:    exitInfo.profitLoss || null,
            entryPrice:    exitInfo.entryPrice || pos?.entryPrice || null,
            entryTime:     exitInfo.entryTime  || pos?.entryTime  || null,
            recentPrices:  data.closes.slice(-30),
          };
        } catch (err) {
          return null;
        }
      })
    );

    const valid = batchResults.filter(Boolean);
    results.push(...valid);
    scanProgress.done += batch.length;
    partialCache = buildPayload(results, false);

    if (bi < batches.length - 1) {
      await sleep(BATCH_DELAY);
    }
  }

  const final = buildPayload(results, true);
  signalCache  = final;
  cacheTime    = Date.now();
  isScanning   = false;
  partialCache = null;
  console.log(`✅ Scan complete: ${results.length} valid stocks | ${getISTTime()}`);
}

function buildPayload(results, isFinal) {
  const sorted = [...results].sort((a, b) => {
    // Priority order: BUY > WEAK BUY > HOLD > SELL
    const rank = s => s === "BUY" ? 4 : s === "WEAK BUY" ? 3 : s === "HOLD" ? 2 : 1;
    const rankDiff = rank(b.signal) - rank(a.signal);
    if (rankDiff !== 0) return rankDiff;
    if (a.confluence && !b.confluence) return -1;
    if (b.confluence && !a.confluence) return 1;
    return b.score - a.score;
  });

  // Best stock: prefer strong BUY with confluence, fallback to WEAK BUY
  const best =
    sorted.find(s => s.signal === "BUY" && s.confluence) ||
    sorted.find(s => s.signal === "BUY") ||
    sorted.find(s => s.signal === "WEAK BUY" && s.confluence) ||
    sorted.find(s => s.signal === "WEAK BUY") ||
    sorted[0] ||
    null;

  const buyCount      = sorted.filter(s => s.signal === "BUY").length;
  const weakBuyCount  = sorted.filter(s => s.signal === "WEAK BUY").length;
  const sellCount     = sorted.filter(s => s.signal === "SELL").length;
  const holdCount     = sorted.filter(s => s.signal === "HOLD").length;
  const confluenceCount = sorted.filter(s => s.confluence).length;

  return {
    marketOpen:     true,
    signals:        sorted,
    bestStock:      best ? best.symbol : null,
    bestSignal:     best ? best.signal : null,
    timestamp:      getISTTime(),
    openPositions:  Object.keys(openPositions).length,
    scanComplete:   isFinal,
    totalScanned:   results.length,
    summary: {
      buy:        buyCount,
      weakBuy:    weakBuyCount,
      sell:       sellCount,
      hold:       holdCount,
      confluence: confluenceCount,
    },
  };
}

// ── /health ───────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: getISTTime() });
});

// ── /status ───────────────────────────────────────────────────────────────────
app.get("/status", (req, res) => {
  res.json({
    marketOpen:    isMarketOpen(),
    openPositions: Object.keys(openPositions).length,
    totalStocks:   STOCKS.length,
    isScanning,
    scanProgress,
    timestamp:     getISTTime(),
  });
});

// ── /scan-status ──────────────────────────────────────────────────────────────
app.get("/scan-status", (req, res) => {
  res.json({
    isScanning,
    done:    scanProgress.done,
    total:   scanProgress.total,
    pct:     scanProgress.total > 0 ? Math.round((scanProgress.done / scanProgress.total) * 100) : 0,
    started: scanProgress.started,
  });
});

// ── /signals ──────────────────────────────────────────────────────────────────
app.get("/signals", async (req, res) => {
  if (!isMarketOpen() && req.query.force !== "true") {
    return res.json({
      marketOpen: false,
      message:    "Market closed. NSE/BSE opens at 9:15 AM IST, Mon–Fri.",
      signals:    [],
      bestStock:  null,
    });
  }

  const limit    = Math.min(500, parseInt(req.query.limit || "200"));
  const exchange = (req.query.exchange || "ALL").toUpperCase();

  // Filter by signal type: ?type=BUY | WEAKBUY | SELL | HOLD | ALL
  const typeFilter = (req.query.type || "ALL").toUpperCase();

  if (signalCache && Date.now() - cacheTime < CACHE_TTL && req.query.force !== "true") {
    const payload = filterPayload(signalCache, limit, exchange, typeFilter);
    return res.json(payload);
  }

  if (isScanning && partialCache) {
    const payload = filterPayload(partialCache, limit, exchange, typeFilter);
    return res.json({ ...payload, scanComplete: false });
  }

  runFullScan().catch(console.error);

  if (signalCache) {
    const payload = filterPayload(signalCache, limit, exchange, typeFilter);
    return res.json({ ...payload, scanComplete: false, stale: true });
  }

  await sleep(3000);
  if (partialCache) {
    const payload = filterPayload(partialCache, limit, exchange, typeFilter);
    return res.json({ ...payload, scanComplete: false });
  }

  res.json({
    marketOpen:   true,
    signals:      [],
    bestStock:    null,
    scanComplete: false,
    message:      "Scan starting, please refresh in 30 seconds",
  });
});

function filterPayload(payload, limit, exchange, typeFilter = "ALL") {
  let signals = payload.signals;

  if (exchange !== "ALL") {
    signals = signals.filter(s => s.exchange === exchange);
  }

  if (typeFilter !== "ALL") {
    if (typeFilter === "BUY") {
      // BUY only (not WEAK BUY)
      signals = signals.filter(s => s.signal === "BUY");
    } else if (typeFilter === "WEAKBUY" || typeFilter === "WEAK BUY") {
      signals = signals.filter(s => s.signal === "WEAK BUY");
    } else if (typeFilter === "BUYS") {
      // Both BUY and WEAK BUY
      signals = signals.filter(s => s.signal === "BUY" || s.signal === "WEAK BUY");
    } else {
      signals = signals.filter(s => s.signal === typeFilter);
    }
  }

  return {
    ...payload,
    signals: signals.slice(0, limit),
  };
}

// ── Cron Jobs ─────────────────────────────────────────────────────────────────
cron.schedule("15 9 * * 1-5", () => {
  console.log("🟢 Market OPEN — Launching first scan");
  signalCache = null;
  runFullScan().catch(console.error);
}, { timezone: "Asia/Kolkata" });

cron.schedule("30 15 * * 1-5", () => {
  console.log("🔴 Market CLOSED — Clearing positions");
  Object.keys(openPositions).forEach(k => delete openPositions[k]);
  signalCache = null;
}, { timezone: "Asia/Kolkata" });

cron.schedule("*/2 * * * 1-5", () => {
  if (isMarketOpen() && !isScanning) {
    console.log(`🔄 Scheduled rescan (${getISTTime()})`);
    signalCache = null;
    runFullScan().catch(console.error);
  }
}, { timezone: "Asia/Kolkata" });

// ── Keep-Alive Ping ───────────────────────────────────────────────────────────
const SELF_URL = process.env.RENDER_EXTERNAL_URL;
if (SELF_URL) {
  cron.schedule("*/10 * * * 1-5", async () => {
    try {
      await axios.get(`${SELF_URL}/health`, { timeout: 5000 });
      console.log(`💓 Keep-alive OK (${getISTTime()})`);
    } catch (e) {
      console.warn("⚠️ Keep-alive failed:", e.message);
    }
  }, { timezone: "Asia/Kolkata" });
  console.log(`💓 Keep-alive enabled → ${SELF_URL}/health`);
}

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  const nets    = Object.values(os.networkInterfaces()).flat();
  const localIP = nets.find(n => n.family === "IPv4" && !n.internal)?.address ?? "localhost";

  console.log("🚀 Stock Signal Engine v3.1");
  console.log(`➡  Local:   http://localhost:${PORT}`);
  console.log(`➡  Network: http://${localIP}:${PORT}`);
  if (SELF_URL) console.log(`➡  Public:  ${SELF_URL}`);
  console.log(`📊 Universe: ${STOCKS.length} stocks (Nifty 500 + BSE 200)`);
  console.log(`📅 Market: ${isMarketOpen() ? "🟢 OPEN — launching scan" : "🔴 CLOSED"}`);

  if (isMarketOpen()) {
    runFullScan().catch(console.error);
  }
});
