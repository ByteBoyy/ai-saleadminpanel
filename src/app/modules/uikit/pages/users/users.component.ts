import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from 'src/app/modules/layout/services/auth.service';
import { Role, RoleDisplayNames } from 'src/app/enums/role.enum';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonService } from 'src/app/modules/layout/services/common.service';
import { TableFooterComponent } from '../table/components/table-footer/table-footer.component';
import { TableFilterService } from '../table/services/table-filter.service';
import { AngularSvgIconModule } from 'angular-svg-icon';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TableFooterComponent, AngularSvgIconModule],
  templateUrl: './users.component.html',
  styleUrl: './users.component.css',
})
export class UsersComponent implements OnInit {
  isAddModalBoxVisible = false;
  isUpdate = false;
  isDeleteModalBoxVisible = false;
  selectedUser: any | null = null;
  isLoading = false;
  isSuspended = false;
  RoleDisplayNames = RoleDisplayNames;
  roleOptions = [
    { label: 'Super Admin', value: Role.SuperAdmin },
    { label: 'Admin', value: Role.Admin },
    { label: 'User', value: Role.User },
  ];

  userForm: FormGroup;

  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toastr = inject(ToastrService);
  private readonly commonSrv = inject(CommonService);
  private readonly filterService = inject(TableFilterService);

  constructor() {
    this.userForm = this.fb.group({
      id: [''],
      name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      country: ['', Validators.required],
      role: [null, Validators.required],
      suspended: [false],
    });
  }

  async ngOnInit(): Promise<void> {
    const currentUser = this.commonSrv.getUser();
    if (Number(currentUser?.role) !== Number(Role.SuperAdmin)) {
      this.roleOptions = this.roleOptions.filter((option) => option.value !== Role.SuperAdmin);
    }

    await this.loadUsers();
    this.resetFilters();
  }

  resetFilters(): void {
    this.filterService.searchField.set('');
    this.filterService.statusField.set('""');
    this.filterService.roleField.set('');
  }
  getRoleDisplay(role: string | number): string {
    return this.RoleDisplayNames[+role as keyof typeof RoleDisplayNames];
  }

  readonly filteredUsers = computed(() => {
    const users = this.users(); // ✅ signal access
    const searchTerm = this.filterService.searchField().toLowerCase();
    const statusFilter = this.filterService.statusField();
    const roleFilter = this.filterService.roleField();

    if (!users || users.length === 0) return [];

    let filtered = [...users];

    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(
        (user) =>
          (user.fullName && user.fullName.toLowerCase().includes(searchTerm)) ||
          (user.email && user.email.toLowerCase().includes(searchTerm)) ||
          (user.country && user.country.toLowerCase().includes(searchTerm)),
      );
    }

    if (statusFilter && statusFilter !== '') {
      if (statusFilter === '1') {
        filtered = filtered.filter((user) => !user.isSuspended);
      } else if (statusFilter === '2') {
        filtered = filtered.filter((user) => user.isSuspended);
      }
    }

    if (roleFilter && roleFilter !== '') {
      filtered = filtered.filter((user) => user.role && user.role.toString() === roleFilter);
    }

    return filtered;
  });

  users = signal<any[]>([]);

  async loadUsers(): Promise<void> {
    this.isLoading = true;
    try {
      const data = await lastValueFrom(this.authService.getUsers());
      this.isLoading = false;
      this.users.set(data.data || []);
    } catch (error: unknown) {
      this.isLoading = false;
      this.users.set([]);
      if (error instanceof HttpErrorResponse) {
        this.toastr.error(error.error?.message || 'Error loading users');
      } else {
        this.toastr.error('An unexpected error occurred while loading users');
      }
    }
  }

  // Modal controls
  toggleAddModalBox(): void {
    this.isAddModalBoxVisible = !this.isAddModalBoxVisible;
    this.isUpdate = false;
    if (!this.isAddModalBoxVisible) {
      this.userForm.reset();
    }
  }

  toggleDeleteModalBox(): void {
    this.isDeleteModalBoxVisible = !this.isDeleteModalBoxVisible;
  }

  update(id: string): void {
    this.isUpdate = true;
    this.isAddModalBoxVisible = true;

    this.selectedUser = this.users().find((user) => user.id === id);

    if (this.selectedUser) {
      if (Number(this.selectedUser.role) === Role.SuperAdmin) {
        this.userForm.get('role')?.disable();
      } else {
        this.userForm.get('role')?.enable();
      }

      this.userForm.patchValue({
        id: this.selectedUser.id,
        name: this.selectedUser.fullName,
        email: this.selectedUser.email,
        country: this.selectedUser.country,
        role: this.selectedUser.role,
        suspended: this.selectedUser.suspended ?? false,
      });
    }
  }
  delete(id: string): void {
    this.selectedUser = this.users().find((user) => user.id === id);
    this.toggleDeleteModalBox();
  }

  async confirmDelete(): Promise<void> {
    if (!this.selectedUser) return;

    this.isLoading = true;
    try {
      await lastValueFrom(this.authService.deleteUser(this.selectedUser.id));
      this.isLoading = false;
      this.toastr.success('User deleted successfully');
      this.loadUsers();
    } catch (error: unknown) {
      this.isLoading = false;
      if (error instanceof HttpErrorResponse) {
        this.toastr.error(error.error?.message || 'Failed to delete user');
      } else {
        this.toastr.error('An unexpected error occurred while deleting user');
      }
    }

    this.toggleDeleteModalBox();
  }

  async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      this.toastr.error('Please fix the errors in the form');
      return;
    }

    this.isLoading = true;
    try {
      const res = await lastValueFrom(
        this.authService.updateUser(this.selectedUser.id, {
          role: this.userForm.value.role,
          fullName: this.userForm.value.name,
          email: this.userForm.value.email,
          country: this.userForm.value.country,
          suspended: this.userForm.value.suspended,
        }),
      );
      this.isLoading = false;
      this.toastr.success('User updated successfully');
      this.loadUsers();
      this.toggleAddModalBox();
    } catch (error: unknown) {
      this.isLoading = false;
      if (error instanceof HttpErrorResponse) {
        this.toastr.error(error.error?.message || 'Failed to update user');
      } else {
        this.toastr.error('An unexpected error occurred while updating user');
      }
    }
  }

  toggleSuspend(user: any): void {
    const updatedStatus = !user.isSuspended;

    this.authService
      .updateUser(user.id, {
        isSuspended: updatedStatus,
      })
      .subscribe({
        next: () => {
          user.isSuspended = updatedStatus;
          this.toastr.success(`User ${updatedStatus ? 'suspended' : 'unblocked'} successfully`);
        },
        error: (error) => {
          this.toastr.error('Failed to update suspension status');
        },
      });
  }

  onSearchChange(value: Event) {
    const input = value.target as HTMLInputElement;
    this.filterService.searchField.set(input.value);
  }

  onStatusChange(value: Event) {
    const selectElement = value.target as HTMLSelectElement;
    this.filterService.statusField.set(selectElement.value);
  }

  onRoleChange(value: Event) {
    const selectElement = value.target as HTMLSelectElement;
    this.filterService.roleField.set(selectElement.value);
  }
}
