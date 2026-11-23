// ============================================
// AUTH CONTROLLER - Khan Brothers Workshop ERP
// Authentication & User Profile Controller
// ============================================

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authModel = require('./auth.model');
const { ROLES, AUDIT_ACTIONS } = require('../../utils/constants');
const { effectivePermissions, getOverrides, loadOverrides } = require('../../utils/routePermissions');

/**
 * Generate JWT token containing user id and role
 * Expiry configured via process.env.JWT_EXPIRES_IN
 * @param {Object} user
 * @returns {string} JWT Token
 */
function generateToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

/**
 * Cookie configuration options for authentication token
 * @returns {Object} Cookie options
 */
function getCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    };
}

/**
 * Safely extract client IP address from request
 * @param {Object} req Express request
 * @returns {string|null} IP Address
 */
function getClientIp(req) {
    if (!req) return null;
    return req.ip || (req.headers && req.headers['x-forwarded-for']) || req.socket?.remoteAddress || null;
}

/**
 * POST /api/auth/register
 * Register a new user:
 * - If called by admin/owner: Can assign staff roles (admin, manager, salesman, mechanic, accountant)
 * - If called publicly or by non-admin: Automatically assigns customer role
 */
async function register(req, res) {
    try {
        const { name, email, password, phone, role, address } = req.body;

        // Normalize email
        const normalizedEmail = email.toLowerCase().trim();

        // Check if email is already registered
        const existingUser = await authModel.findByEmail(normalizedEmail);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Email already registered',
                message: 'A user account with this email address already exists'
            });
        }

        // Determine assigned role:
        // Admin or Owner can create staff or customer accounts
        // Public registration always assigns customer role
        const isAdmin = req.user && (req.user.role === ROLES.ADMIN || req.user.role === ROLES.OWNER);
        let assignedRole = ROLES.CUSTOMER;

        if (isAdmin && role) {
            const validRoles = Object.values(ROLES);
            if (validRoles.includes(role)) {
                assignedRole = role;
            } else {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid role',
                    message: `Invalid role specified. Allowed roles: ${validRoles.join(', ')}`
                });
            }
        }

        const actorPermissions = req.user?.role === ROLES.ADMIN ? effectivePermissions(req.user, await getOverrides(req)) : [];
        if (req.user?.role === ROLES.ADMIN && (
            [ROLES.ADMIN, ROLES.OWNER].includes(assignedRole) ||
            effectivePermissions({ role: assignedRole }).some(key => !actorPermissions.includes(key))
        )) {
            return res.status(403).json({ success: false, error: 'You cannot assign this role.' });
        }

        // Create new user in database
        const newUser = await authModel.createUser({
            name,
            email: normalizedEmail,
            password,
            phone,
            role: assignedRole,
            address,
            is_active: 1
        });

        const clientIp = getClientIp(req);

        // Record audit trail
        await authModel.recordAuditTrail({
            userId: req.user ? req.user.id : newUser.id,
            userName: req.user ? req.user.name : newUser.name,
            action: AUDIT_ACTIONS.CREATE,
            module: 'auth',
            recordId: newUser.id,
            oldValues: null,
            newValues: {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
            },
            ipAddress: clientIp,
            description: isAdmin
                ? `Admin ${req.user.name} registered user ${newUser.email} with role '${newUser.role}'`
                : `User ${newUser.email} registered account with role '${newUser.role}'`
        });

        // If registered by admin, do not change existing admin auth session
        if (isAdmin) {
            return res.status(201).json({
                success: true,
                data: {
                    user: newUser
                },
                message: `User created successfully with role '${newUser.role}'`
            });
        }

        // For public customer registration: generate token and set cookie
        const token = generateToken(newUser);
        res.cookie('token', token, getCookieOptions());

        return res.status(201).json({
            success: true,
            data: {
                user: newUser,
                token
            },
            message: 'User registered successfully'
        });

    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while registering the user'
        });
    }
}

/**
 * POST /api/auth/login
 * Login with email and password, return JWT token, set auth cookie, and record audit trail
 */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing credentials',
                message: 'Email and password are required'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        // Retrieve user by email (including password hash)
        const user = await authModel.findByEmail(normalizedEmail);
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                message: 'Invalid email or password'
            });
        }

        // Verify account active status
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                error: 'Account inactive',
                message: 'Your account has been deactivated. Please contact an administrator.'
            });
        }

        // Compare password hash
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = generateToken(user);

        // Update last login timestamp
        await authModel.updateLastLogin(user.id);

        const clientIp = getClientIp(req);

        // Record audit trail entry
        await authModel.recordAuditTrail({
            userId: user.id,
            userName: user.name,
            action: AUDIT_ACTIONS.LOGIN,
            module: 'auth',
            recordId: user.id,
            oldValues: null,
            newValues: {
                email: user.email,
                role: user.role
            },
            ipAddress: clientIp,
            description: `User ${user.email} (${user.role}) logged in successfully`
        });

        // Set HTTP-only cookie
        res.cookie('token', token, getCookieOptions());

        // Prepare sanitized user response (exclude password)
        const { password: _, ...userProfile } = user;

        return res.status(200).json({
            success: true,
            data: {
                user: userProfile,
                token
            },
            message: 'Login successful'
        });

    } catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred during login'
        });
    }
}

/**
 * POST /api/auth/logout
 * Clear token cookie and optionally record audit trail
 */
async function logout(req, res) {
    try {
        const clientIp = getClientIp(req);

        if (req.user) {
            await authModel.recordAuditTrail({
                userId: req.user.id,
                userName: req.user.name,
                action: AUDIT_ACTIONS.LOGOUT,
                module: 'auth',
                recordId: req.user.id,
                oldValues: null,
                newValues: null,
                ipAddress: clientIp,
                description: `User ${req.user.email} logged out`
            });
        }

        // Clear HTTP-only cookie
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        return res.status(200).json({
            success: true,
            data: null,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred during logout'
        });
    }
}

/**
 * GET /api/auth/me
 * Get current logged-in user profile
 */
async function getMe(req, res) {
    try {
        const user = await authModel.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'User profile not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: { ...user, permissions: effectivePermissions(user, await getOverrides(req)) },
            message: 'User profile retrieved successfully'
        });

    } catch (error) {
        console.error('getMe error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while retrieving user profile'
        });
    }
}

/**
 * PUT /api/auth/me
 * Update current logged-in user profile
 */
async function updateMe(req, res) {
    try {
        const { name, phone, address, email } = req.body;
        const currentUserId = req.user.id;

        // Fetch current user state
        const currentUser = await authModel.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'User profile not found'
            });
        }

        // If email is changing, verify uniqueness
        if (email && email.toLowerCase().trim() !== currentUser.email.toLowerCase()) {
            const normalizedEmail = email.toLowerCase().trim();
            const existingEmailUser = await authModel.findByEmail(normalizedEmail);
            if (existingEmailUser && existingEmailUser.id !== currentUserId) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already exists',
                    message: 'This email is already in use by another account'
                });
            }
        }

        // Perform user update (users cannot change their own role or active status through this endpoint)
        const updatedUser = await authModel.updateUser(currentUserId, {
            name,
            phone,
            address,
            email: email ? email.toLowerCase().trim() : undefined
        });

        const clientIp = getClientIp(req);

        // Record audit trail
        await authModel.recordAuditTrail({
            userId: currentUserId,
            userName: updatedUser.name,
            action: AUDIT_ACTIONS.UPDATE,
            module: 'auth',
            recordId: currentUserId,
            oldValues: {
                name: currentUser.name,
                email: currentUser.email,
                phone: currentUser.phone,
                address: currentUser.address
            },
            newValues: {
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone,
                address: updatedUser.address
            },
            ipAddress: clientIp,
            description: `User ${updatedUser.email} updated profile details`
        });

        return res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        console.error('updateMe error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while updating profile'
        });
    }
}

/**
 * PUT /api/auth/change-password
 * Change current logged-in user password
 */
async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;
        const currentUserId = req.user.id;

        // Retrieve user with password hash
        const user = await authModel.findById(currentUserId, true);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'User not found'
            });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: 'Invalid password',
                message: 'Current password does not match'
            });
        }

        // Update password with new hash
        await authModel.updatePassword(currentUserId, newPassword);

        const clientIp = getClientIp(req);

        // Record audit trail
        await authModel.recordAuditTrail({
            userId: currentUserId,
            userName: user.name,
            action: AUDIT_ACTIONS.UPDATE,
            module: 'auth',
            recordId: currentUserId,
            oldValues: null,
            newValues: null,
            ipAddress: clientIp,
            description: `User ${user.email} changed password`
        });

        return res.status(200).json({
            success: true,
            data: null,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('changePassword error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while changing password'
        });
    }
}

/**
 * GET /api/auth/users
 * Paginated list of users (Admin and Management only)
 */
async function getUsers(req, res) {
    try {
        const { page = 1, limit = 20, role, search, is_active } = req.query;

        const result = await authModel.findAllUsers({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            role,
            search,
            isActive: is_active
        });

        return res.status(200).json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            message: 'Users retrieved successfully'
        });

    } catch (error) {
        console.error('getUsers error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while retrieving users'
        });
    }
}

/**
 * GET /api/auth/users/:id
 * Get single user by ID (Admin and Management only)
 */
async function getUserById(req, res) {
    try {
        const user = await authModel.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: `User with ID ${req.params.id} not found`
            });
        }

        return res.status(200).json({
            success: true,
            data: user,
            message: 'User retrieved successfully'
        });

    } catch (error) {
        console.error('getUserById error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while retrieving user'
        });
    }
}

/**
 * PUT /api/auth/users/:id
 * Update user details/role/status by administrator (Admin only)
 */
async function updateUserById(req, res) {
    try {
        const targetUserId = req.params.id;
        const { name, phone, address, email, role, is_active } = req.body;

        const targetUser = await authModel.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: `User with ID ${targetUserId} not found`
            });
        }

        // Validate role if updating
        if (role && !Object.values(ROLES).includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role',
                message: `Invalid role specified. Allowed roles: ${Object.values(ROLES).join(', ')}`
            });
        }

        const self = req.user.id === targetUser.id;
        const lockedAccount = [ROLES.OWNER, ROLES.ADMIN].includes(targetUser.role);
        if ((self && ((role && role !== targetUser.role) || is_active === false || is_active === 0 || is_active === '0')) ||
            (req.user.role === ROLES.ADMIN && ((!self && lockedAccount) || (role && role !== targetUser.role && [ROLES.OWNER, ROLES.ADMIN].includes(role))))) {
            return res.status(403).json({ success: false, error: 'You cannot change this account’s role or access.' });
        }
        const assigningAccess = (role && role !== targetUser.role) || (!targetUser.is_active && [true, 1, '1'].includes(is_active));
        if (req.user.role === ROLES.ADMIN && assigningAccess) {
            const actorPermissions = effectivePermissions(req.user, await getOverrides(req));
            const targetPermissions = effectivePermissions({ role: role || targetUser.role }, await loadOverrides(targetUser.id));
            if (targetPermissions.some(key => !actorPermissions.includes(key))) {
                return res.status(403).json({ success: false, error: 'You cannot grant access you do not hold.' });
            }
        }

        // Verify email uniqueness if email is changed
        if (email && email.toLowerCase().trim() !== targetUser.email.toLowerCase()) {
            const normalizedEmail = email.toLowerCase().trim();
            const existingEmailUser = await authModel.findByEmail(normalizedEmail);
            if (existingEmailUser && existingEmailUser.id !== parseInt(targetUserId, 10)) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already exists',
                    message: 'This email is already in use by another user account'
                });
            }
        }

        const updatedUser = await authModel.updateUser(targetUserId, {
            name,
            phone,
            address,
            email: email ? email.toLowerCase().trim() : undefined,
            role,
            is_active
        });

        const clientIp = getClientIp(req);

        await authModel.recordAuditTrail({
            userId: req.user.id,
            userName: req.user.name,
            action: AUDIT_ACTIONS.UPDATE,
            module: 'auth',
            recordId: targetUser.id,
            oldValues: {
                name: targetUser.name,
                email: targetUser.email,
                role: targetUser.role,
                is_active: targetUser.is_active
            },
            newValues: {
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                is_active: updatedUser.is_active
            },
            ipAddress: clientIp,
            description: `Admin ${req.user.name} updated user ${updatedUser.email}`
        });

        return res.status(200).json({
            success: true,
            data: updatedUser,
            message: 'User updated successfully'
        });

    } catch (error) {
        console.error('updateUserById error:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Server error',
            message: 'An error occurred while updating user'
        });
    }
}

module.exports = {
    register,
    login,
    logout,
    getMe,
    updateMe,
    changePassword,
    getUsers,
    getUserById,
    updateUserById
};
