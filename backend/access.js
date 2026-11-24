'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { problem } = require('./supabase');
const { records } = require('./routes/records');

const permissions = ['dashboard','stock','buy','sell','qist','qist_collect','workshop','workshop_status','parts','customers',
    'profit','daily','download','commission','capital','delete','settings','users'];
const denied = () => problem(403,'Aapko iski permission nahi hai');
const has = (user,key) => Boolean(user?.admin || (key !== 'capital' && user?.permissions.includes(key)));
const root = {id:0,username:'admin',name:'Administrator',role:'admin',active:true,admin:true,permissions};
const isAdmin = role => role?.trim().toLowerCase() === 'admin';
const userView = row => {
    const admin = isAdmin(row.role);
    return { id:row.id, name:row.name, username:row.username, phone:row.phone, role:row.role, active:row.active,
        admin, permissions:admin ? permissions : permissions.filter(key => key !== 'capital' && row.permissions?.includes(key)) };
};

function accountAccess(db,settings,canSignIn,security) {
    async function verify(username,password,code) {
        const name = typeof username === 'string' ? username.trim().toLowerCase() : '';
        if (!canSignIn || !/^[a-z0-9_.-]{3,40}$/.test(name) ||
            typeof password !== 'string' || Buffer.byteLength(password) > 72) throw problem(401,'Invalid username or password.');
        const account = name === 'admin' ? null : (await db.list('kb_users',{username:'eq.'+name}))[0];
        const protectedAccount = name==='admin' || isAdmin(account?.role);
        const securityRow = protectedAccount ? await security.get(account?.id ?? 0) : null;
        const hash = account?.password_hash || securityRow?.password_hash || settings.APP_PASSWORD_HASH;
        const accepted = await bcrypt.compare(password,hash);
        if (!accepted || (name !== 'admin' && (!account?.active || account.deleted_at))) throw problem(401,'Invalid username or password.');
        if (securityRow?.mfa_secret && !await security.verifyCode(securityRow,code)) {
            throw problem(401,'Enter a fresh authenticator code or recovery code.');
        }
        const claims=account ? {sub:String(account.id),rev:account.version} : {sub:'kb-staff'};
        if (securityRow) claims.security=securityRow.version;
        const token = jwt.sign(claims,
            settings.APP_SESSION_SECRET,{expiresIn:'8h',algorithm:'HS256'});
        return {token,user:account ? userView(account) : root};
    }

    async function session(token) {
        let claims;
        try {
            if (!canSignIn) throw new Error();
            claims = jwt.verify(token,settings.APP_SESSION_SECRET,{algorithms:['HS256']});
        } catch { throw problem(401,'Sign in to access Khan Brothers records.'); }
        if (claims.sub === 'kb-staff') {
            if ((await security.get(0))?.version !== claims.security) throw problem(401,'Sign in again to continue.');
            return root;
        }
        if (!/^\d+$/.test(claims.sub)) throw problem(401,'Sign in to access Khan Brothers records.');
        const row = (await db.list('kb_users',{id:'eq.'+claims.sub}))[0];
        if (!row?.active || row.deleted_at || row.version !== claims.rev) throw problem(401,'Sign in to access Khan Brothers records.');
        if (isAdmin(row.role) && (await security.get(row.id))?.version !== claims.security) throw problem(401,'Sign in again to continue.');
        return userView(row);
    }
    return {verify,session};
}

function authorize(req,user) {
    const pathname = req.path.toLowerCase().replace(/\/+$/,'');
    const key = pathname.split('/')[1];
    const read = req.method === 'GET' || req.method === 'HEAD';
    const one = (...keys) => keys.some(permission=>has(user,permission));
    let allowed;
    switch (key) {
    case 'state':
    case 'logout':
    case 'session':
    case 'notifications':
        return;
    case 'bikes':
        allowed = read ? (pathname.includes('/expenses') ? one('stock','buy') : one('stock','sell','buy'))
            : pathname.endsWith('/condition') ? one('sell','buy') : has(user,'buy');
        break;
    case 'sales': allowed = has(user,'sell'); break;
    case 'qist': allowed = read ? has(user,'qist') : has(user,'qist') && has(user,'qist_collect'); break;
    case 'expenses': allowed = has(user,'daily'); break;
    case 'daily-report': allowed = pathname.includes('/repurchase/') ? has(user,'parts') && one('daily','dashboard') : has(user,'daily'); break;
    case 'customers': allowed = has(user,'customers'); break;
    case 'workshop': allowed = has(user,'workshop') && (!/\/(status|cancel)$/.test(pathname) || has(user,'workshop_status')); break;
    case 'spare-parts':
    case 'suppliers': allowed = has(user,'parts'); break;
    case 'commission': allowed = pathname === '/commission/options' ? one('workshop','commission') : has(user,'commission'); break;
    case 'staff':
    case 'settings': allowed = has(user,'settings'); break;
    case 'users': allowed = has(user,'settings') && (read ? one('users','delete')
        : req.method === 'DELETE' ? has(user,'delete') : has(user,'users')); break;
    case 'records': {
        const section = pathname.split('/')[2];
        const permission = Object.hasOwn(records,section) && records[section][0];
        allowed = read && permission && (permission==='admin' ? user.admin : has(user,permission));
        break;
    }
    case 'finance': allowed = pathname.startsWith('/finance/suppliers') ? has(user,'parts') : user.admin; break;
    case 'security': allowed = user.admin; break;
    case 'profit': allowed = has(user,'profit'); break;
    case 'dashboard': allowed = has(user,'dashboard'); break;
    case 'capital': allowed = user.admin; break;
    case 'export': {
        const report = pathname.split('/')[2];
        const reportPermission = {stock:'stock',sold:'sell',customers:'customers',profit:'profit',daily:'daily',qist:'qist',
            commission:'commission',workshop:'workshop'}[report];
        allowed = reportPermission && has(user,'download') && has(user,reportPermission);
        break;
    }
    default: throw problem(404,'Endpoint not found.');
    }
    if (!allowed) throw denied();
}

function restrictedState(snapshot,user) {
    if (user.admin) return snapshot;
    const allowed = key => has(user,key);
    const hasSales = allowed('sell') || allowed('profit') || allowed('customers') || allowed('qist') || allowed('dashboard');
    const sold = hasSales ? snapshot.sold.filter(row=>allowed('sell') || allowed('profit') || allowed('customers') ||
        allowed('dashboard') || (allowed('qist') && row.payment_method==='qist')).map(row => {
        if (allowed('sell')) return row;
        const {customer_cnic,customer_phone,customer_name,profit,cost_at_sale,total_cost,purchase_price,repair_cost,other_cost,...sale} = row;
        const identified=allowed('customers') || (allowed('qist') && row.payment_method==='qist');
        return {...sale,...(identified ? {customer_phone,customer_name,customer_cnic:allowed('customers')?customer_cnic:undefined} : {}),
            ...(allowed('profit')?{profit,cost_at_sale,total_cost,purchase_price,repair_cost,other_cost}:{})};
    }) : [];
    const daily = snapshot.daily && (allowed('daily') || allowed('dashboard'))
        ? { ...snapshot.daily, report:allowed('daily') ? snapshot.daily.report : null, history:allowed('daily') ? snapshot.daily.history : [],
            days:allowed('dashboard') ? snapshot.daily.days.map(({profit,qist_collected,...row}) => ({...row,
                profit:allowed('profit') ? profit : undefined,qist_collected:allowed('qist') ? qist_collected : undefined})) : [],
            repurchase:allowed('parts') ? snapshot.daily.repurchase : [] } : undefined;
    return { ...snapshot,sold,daily,
        bikes:['stock','buy','sell'].some(allowed) ? snapshot.bikes.map(({customer_name,...bike})=>bike) : [],
        customers:allowed('customers') ? snapshot.customers : [],
        qist:allowed('qist') ? snapshot.qist : [],
        expenses:allowed('daily') || allowed('dashboard') || allowed('profit') ? snapshot.expenses : [],
        profit:allowed('profit') ? snapshot.profit : null };
}

module.exports = { accountAccess, authorize, denied, has, isAdmin, permissions, restrictedState, root, userView };
